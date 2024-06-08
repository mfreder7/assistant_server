// dateHelper.ts
import { format as formatTZ, toZonedTime } from "date-fns-tz";

/**
 * Formats the current date to the specified timezone.
 * @param timezone The timezone to format the date to.
 * @returns A formatted date string.
 */
export const formatDateToTimezone = (timezone: string): string => {
  const currentDate = new Date();
  const zonedDate = toZonedTime(currentDate, timezone);
  return formatTZ(zonedDate, "yyyy-MM-dd HH:mm:ssXXX", { timeZone: timezone });
};
