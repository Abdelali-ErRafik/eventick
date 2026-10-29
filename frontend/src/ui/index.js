/**
 * Eventick's shared component layer.
 *
 * One set, used by BOTH the buyer screens and the /pro dashboard. The two
 * areas differ by density and composition, never by having their own private
 * copy of a button — which is how 69 distinct button class strings and four
 * incompatible modals came to exist.
 *
 * Rules for anything added here:
 *   - colour comes from a semantic token (primary/danger/success/...), never
 *     a brand name and never a hex;
 *   - spacing and sizing use the logical properties (ms/me, start/end) so
 *     Arabic mirrors for free;
 *   - accessibility lives in the component, so no call site has to remember.
 */
export { Button, IconButton } from "./Button.jsx";
export { Field, Input, Select, Textarea, triggerControlClass } from "./Field.jsx";
export { Dropdown } from "./Dropdown.jsx";
export { DateField, TimeField } from "./DateField.jsx";
export { SalesWindow, salesWindowAt, splitSalesWindow } from "./SalesWindow.jsx";
export { RadioOption, CheckOption } from "./Choice.jsx";
export { RangeField } from "./RangeField.jsx";
export { Modal } from "./Modal.jsx";
export { Popover, PopoverItem } from "./Popover.jsx";
export { Badge, DataState, EmptyState, ErrorState, LoadingState, Notice, Skeleton } from "./Feedback.jsx";
export { Card, Container, PageHeader, SectionHeader, Stat } from "./Surface.jsx";
export { Countdown } from "./Countdown.jsx";
export { Verdict } from "./Verdict.jsx";
