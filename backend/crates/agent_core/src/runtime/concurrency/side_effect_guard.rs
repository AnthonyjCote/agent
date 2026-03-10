use crate::models::side_effect::SideEffectLifecycleState;

pub fn can_transition(
    current: SideEffectLifecycleState,
    next: SideEffectLifecycleState,
) -> bool {
    use SideEffectLifecycleState::*;

    match (current, next) {
        (Proposed, Approved | Failed) => true,
        (Approved, Dispatched | Failed) => true,
        (Dispatched, Acknowledged | Failed) => true,
        (Acknowledged, Completed | Failed) => true,
        (Completed, _) => false,
        (Failed, _) => false,
        _ => false,
    }
}
