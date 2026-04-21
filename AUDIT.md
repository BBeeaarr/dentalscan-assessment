# DentalScan Discovery Scan Audit

After completing the production demo flow (Front, Left, Right, Upper, Lower), my overall impression is that the core concept is strong, but the current experience feels like an MVP and does not yet reflect the polish expected for a trust-critical healthcare workflow.

## What Could Be Smoother

- The capture journey is functional but feels abrupt between steps; stronger visual continuity and clearer progression states would reduce user uncertainty.
- There is limited real-time capture guidance (distance, framing, stability), which increases retake risk and lowers confidence during scan collection.
- The post-scan experience feels incomplete: there is little feedback about what happens next, no clear handoff to messaging/results, and minimal perceived system activity.
- The UI appears utilitarian rather than clinical-grade, which may affect user trust for first-time patients.

## Technical Challenges (Mobile Camera Stability)

- Browser camera APIs can vary by device/OS, creating inconsistent autofocus, exposure, frame timing, and image quality.
- Hand motion, low light, and distance drift are common in self-capture and can degrade scan quality without immediate correction cues.
- Real-time guardrails in web contexts must balance responsiveness with CPU/battery impact; heavy frame analysis can hurt performance on lower-end phones.
- Permission prompts, tab lifecycle behavior, and camera session interruptions can break flow continuity.

## Recommendation

Short term: improve web capture with lightweight real-time guardrails, stronger state feedback, and a complete post-scan handoff.

Long term: consider a dedicated mobile app for more reliable camera control, frame processing, and guardrail quality enforcement. For this use case, native camera access would likely deliver materially better consistency and UX.