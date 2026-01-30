/**
 * Reflection Components
 * 
 * Components for the "Digital Point-and-Call" reflection system.
 */

export { ReflectionLockScreen } from './ReflectionLockScreen';
export { VoiceConfirmButton } from './VoiceConfirmButton';

// Re-export hook and types
export {
    useReflectionChat,
    type ReflectionTriggerType,
    type ConfirmationType,
    type ReflectionChatResponse,
} from '../../hooks/useReflectionChat';
