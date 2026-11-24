// ponytail: a fixed palette picked by account id; colors repeat after 8 accounts
const PALETTE = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444", "#84cc16"];
/** Each account keeps one color everywhere (switcher, calendar, upload list) so it is told apart at a glance. */
export const accountColor = (id: number) => PALETTE[(Math.abs(id) - 1 + PALETTE.length) % PALETTE.length];
