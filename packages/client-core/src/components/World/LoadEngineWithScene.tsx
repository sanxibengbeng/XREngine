import { useHookstate } from '@hookstate/core'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { LocationInstanceConnectionServiceReceptor } from '@xrengine/client-core/src/common/services/LocationInstanceConnectionService'
import { LocationService } from '@xrengine/client-core/src/social/services/LocationService'
import { leaveNetwork } from '@xrengine/client-core/src/transports/SocketWebRTCClientFunctions'
import { useAuthState } from '@xrengine/client-core/src/user/services/AuthService'
import { SceneServiceReceptor, useSceneState } from '@xrengine/client-core/src/world/services/SceneService'
import { UserId } from '@xrengine/common/src/interfaces/UserId'
import multiLogger from '@xrengine/common/src/logger'
import { getSearchParamFromURL } from '@xrengine/common/src/utils/getSearchParamFromURL'
import { getRandomSpawnPoint, getSpawnPoint } from '@xrengine/engine/src/avatar/AvatarSpawnSystem'
import { teleportAvatar } from '@xrengine/engine/src/avatar/functions/moveAvatar'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { EngineActions, useEngineState } from '@xrengine/engine/src/ecs/classes/EngineState'
import { addComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { SystemModuleType } from '@xrengine/engine/src/ecs/functions/SystemFunctions'
import { spawnLocalAvatarInWorld } from '@xrengine/engine/src/networking/functions/receiveJoinWorld'
import { PortalEffects } from '@xrengine/engine/src/scene/components/PortalComponent'
import { UUIDComponent } from '@xrengine/engine/src/scene/components/UUIDComponent'
import { setAvatarToLocationTeleportingState } from '@xrengine/engine/src/scene/functions/loaders/PortalFunctions'
import { XRState } from '@xrengine/engine/src/xr/XRState'
import { addActionReceptor, dispatchAction, getState, removeActionReceptor } from '@xrengine/hyperflux'

import { AppLoadingAction, AppLoadingStates, useLoadingState } from '../../common/services/AppLoadingService'
import { NotificationService } from '../../common/services/NotificationService'
import { useRouter } from '../../common/services/RouterService'
import { useLocationState } from '../../social/services/LocationService'
import { SocketWebRTCClientNetwork } from '../../transports/SocketWebRTCClientNetwork'
import { initClient, loadScene } from './LocationLoadHelper'

const logger = multiLogger.child({ component: 'client-core:world' })

type LoadEngineProps = {
  setClientReady: (ready: boolean) => void
  injectedSystems?: SystemModuleType<any>[]
}

export const useLoadEngine = ({ setClientReady, injectedSystems }: LoadEngineProps) => {
  useEffect(() => {
    initClient(injectedSystems).then(() => {
      setClientReady(true)
    })

    addActionReceptor(SceneServiceReceptor)
    addActionReceptor(LocationInstanceConnectionServiceReceptor)

    return () => {
      removeActionReceptor(SceneServiceReceptor)
      removeActionReceptor(LocationInstanceConnectionServiceReceptor)
    }
  }, [])
}

export const useLocationSpawnAvatar = (spectateIfNoVR = false) => {
  const engineState = useEngineState()
  const authState = useAuthState()

  const vrSupported = useHookstate(getState(XRState)).supportedSessionModes['immersive-vr'].value
  const spectateParam = useParams<{ spectate: UserId }>().spectate

  useEffect(() => {
    if (spectateIfNoVR && !vrSupported) {
      if (!engineState.sceneLoaded.value || !authState.user.value || !authState.user.avatar.value) return
      dispatchAction(EngineActions.spectateUser({}))
      dispatchAction(EngineActions.joinedWorld({}))
      return
    }

    if (
      Engine.instance.currentWorld.localClientEntity ||
      !engineState.sceneLoaded.value ||
      !authState.user.value ||
      !authState.user.avatar.value ||
      spectateParam
    )
      return

    // the avatar should only be spawned once, after user auth and scene load
    const user = authState.user
    const avatarDetails = user.avatar.value
    const spawnPoint = getSearchParamFromURL('spawnPoint')

    const avatarSpawnPose = spawnPoint
      ? getSpawnPoint(spawnPoint, Engine.instance.userId)
      : getRandomSpawnPoint(Engine.instance.userId)

    if (avatarDetails.modelResource?.url)
      spawnLocalAvatarInWorld({
        avatarSpawnPose,
        avatarDetail: {
          avatarURL: avatarDetails.modelResource?.url!,
          thumbnailURL: avatarDetails.thumbnailResource?.url!
        },
        name: user.name.value
      })
    else {
      NotificationService.dispatchNotify(
        'Your avatar is missing its model. Please change your avatar from the user menu.',
        { variant: 'error' }
      )
    }
  }, [engineState.sceneLoaded, authState.user, authState.user?.avatar, spectateParam])
}

export const usePortalTeleport = () => {
  const route = useRouter()
  const engineState = useEngineState()
  const locationState = useLocationState()
  const authState = useAuthState()

  useEffect(() => {
    if (engineState.isTeleporting.value) {
      logger.info('Resetting connection for portal teleport.')
      const world = Engine.instance.currentWorld
      const activePortal = world.activePortal

      if (!activePortal) return

      const currentLocation = locationState.locationName.value.split('/')[1]
      if (
        currentLocation === activePortal.location ||
        UUIDComponent.entitiesByUUID[activePortal.linkedPortalId]?.value
      ) {
        teleportAvatar(
          world.localClientEntity,
          activePortal.remoteSpawnPosition
          // activePortal.remoteSpawnRotation
        )
        world.activePortal = null
        dispatchAction(EngineActions.setTeleporting({ isTeleporting: false, $time: Date.now() + 500 }))
        return
      }

      if (activePortal.redirect) {
        window.location.href = Engine.instance.publicPath + '/location/' + activePortal.location
        return
      }

      route('/location/' + world.activePortal!.location)
      LocationService.getLocationByName(world.activePortal!.location, authState.user.id.value)

      // shut down connection with existing world instance server
      // leaving a world instance server will check if we are in a location media instance and shut that down too
      leaveNetwork(world.worldNetwork as SocketWebRTCClientNetwork)

      setAvatarToLocationTeleportingState(world)
      if (activePortal.effectType !== 'None') {
        addComponent(world.localClientEntity, PortalEffects.get(activePortal.effectType), true)
      } else {
        dispatchAction(AppLoadingAction.setLoadingState({ state: AppLoadingStates.START_STATE }))
      }
    }
  }, [engineState.isTeleporting])
}

type Props = {
  injectedSystems?: SystemModuleType<any>[]
}

export const LoadEngineWithScene = ({ injectedSystems }: Props) => {
  const engineState = useEngineState()
  const sceneState = useSceneState()
  const loadingState = useLoadingState()
  const [clientReady, setClientReady] = useState(false)

  useLoadEngine({ setClientReady, injectedSystems })
  useLocationSpawnAvatar()
  usePortalTeleport()

  /**
   * load the scene whenever it changes
   */
  useEffect(() => {
    // loadScene() deserializes the scene data, and deserializers sometimes mutate/update that data for backwards compatability.
    // Since hookstate throws errors when mutating proxied values, we have to pass down the unproxied value here
    const sceneData = sceneState.currentScene.get({ noproxy: true })
    if (clientReady && sceneData) {
      if (loadingState.state.value !== AppLoadingStates.SUCCESS)
        dispatchAction(AppLoadingAction.setLoadingState({ state: AppLoadingStates.SCENE_LOADING }))
      loadScene(sceneData)
    }
  }, [clientReady, sceneState.currentScene])

  useEffect(() => {
    if (engineState.sceneLoaded.value && loadingState.state.value !== AppLoadingStates.SUCCESS)
      dispatchAction(AppLoadingAction.setLoadingState({ state: AppLoadingStates.SUCCESS }))
  }, [engineState.sceneLoaded, engineState.loadingProgress])

  return <></>
}
