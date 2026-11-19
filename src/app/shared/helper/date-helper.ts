/** Returns the month before today as `YYYY-MM`, the format used by `<input type="month">`. */
export function getPreviousMonth(today: Date = new Date()): string {
    const date = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
