import React from 'react'
import { useTranslation } from 'react-i18next'

import { getComponent, useComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { HemisphereLightComponent } from '@xrengine/engine/src/scene/components/HemisphereLightComponent'

import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'

import ColorInput from '../inputs/ColorInput'
import InputGroup from '../inputs/InputGroup'
import NumericInputGroup from '../inputs/NumericInputGroup'
import NodeEditor from './NodeEditor'
import { EditorComponentType, updateProperty } from './Util'

/**
 * HemisphereLightNodeEditor used to provide property customization view for Hemisphere Light.
 */
export const HemisphereLightNodeEditor: EditorComponentType = (props) => {
  const { t } = useTranslation()

  const lightComponent = useComponent(props.node.entity, HemisphereLightComponent).value

  return (
    <NodeEditor
      {...props}
      name={t('editor:properties.hemisphere.name')}
      description={t('editor:properties.hemisphere.description')}
    >
      <InputGroup name="Sky Color" label={t('editor:properties.hemisphere.lbl-skyColor')}>
        <ColorInput value={lightComponent.skyColor} onChange={updateProperty(HemisphereLightComponent, 'skyColor')} />
      </InputGroup>
      <InputGroup name="Ground Color" label={t('editor:properties.hemisphere.lbl-groundColor')}>
        <ColorInput
          value={lightComponent.groundColor}
          onChange={updateProperty(HemisphereLightComponent, 'groundColor')}
        />
      </InputGroup>
      <NumericInputGroup
        name="Intensity"
        label={t('editor:properties.hemisphere.lbl-intensity')}
        min={0}
        smallStep={0.001}
        mediumStep={0.01}
        largeStep={0.1}
        value={lightComponent.intensity}
        onChange={updateProperty(HemisphereLightComponent, 'intensity')}
        unit="cd"
      />
    </NodeEditor>
  )
}

HemisphereLightNodeEditor.iconComponent = VerifiedUserIcon

export default HemisphereLightNodeEditor
