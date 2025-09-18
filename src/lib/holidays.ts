// src/lib/holidays.ts
import { startOfDay, parse as dateFnsParse, isValid as dateFnsIsValid } from 'date-fns';
import { ref, get, type DataSnapshot } from "firebase/database";
import { database } from "@/lib/firebase";

import { getFirebasePathBase } from "./firebaseConfig";

export interface Holiday {
  date: Date; // Parsed and normalized date
  name: string;
}

const HOLIDAYS_PATH = `/${getFirebasePathBase()}/agendamentoWhatsApp/configuracoes/feriados`;
/**
 * Fetches holidays from Firebase Realtime Database.
 * Assumes holidays are stored as an object where keys are "YYYY-MM-DD" and values are holiday names (string).
 * @returns A promise that resolves to an array of Holiday objects.
 */
export async function fetchHolidays(): Promise<Holiday[]> {
  try {
    const holidaysRef = ref(database, HOLIDAYS_PATH);
    console.log("HOLIDAYS_LIB: Fetching holidays from Firebase path:", HOLIDAYS_PATH);
    const snapshot: DataSnapshot = await get(holidaysRef);
    const data = snapshot.val();
    console.log("HOLIDAYS_LIB: Raw holiday data from Firebase (data):", data);
    const fetchedHolidays: Holiday[] = [];

    if (data && typeof data === 'object') {
      Object.values(data).forEach((holidayEntry) => {
        const holidayDetails = holidayEntry as any; // Assuming holidayEntry is an object
        const dateString = holidayDetails.data; // Get the date string from the 'data' field
        let holidayName = holidayDetails.nome || holidayDetails.name || "Feriado"; // Get name from 'nome' or 'name' field, default to "Feriado"

        // Ensure dateString is a string before parsing
        if (typeof dateString !== 'string') {
          console.warn(`HOLIDAYS_LIB: Invalid data type for date encountered in holidays data: ${typeof dateString}. Expected string.`);
          return; // Skip this entry
        }
        // Use the correct format for ISO 8601 string with date-fns parse
        const parsedDate = dateFnsParse(dateString, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", new Date());
        if (dateFnsIsValid(parsedDate)) {
          fetchedHolidays.push({
            date: startOfDay(parsedDate),
            name: holidayName,
          });
 }
      });
    } else {
      console.log("HOLIDAYS_LIB: No holiday data found at path or data is not an object:", HOLIDAYS_PATH);
    }
    console.log("HOLIDAYS_LIB: Processed holidays:", fetchedHolidays);
    return fetchedHolidays;
  } catch (error) {
    console.error("HOLIDAYS_LIB: Error fetching holidays from Firebase:", error);
    return []; // Return empty list on error
  }
}

export function isHoliday(date: Date, holidaysToTest: Holiday[]): Holiday | undefined {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return undefined;
  }
  const checkDateNormalized = startOfDay(date);
  return holidaysToTest.find(
    (holiday) => holiday.date.getTime() === checkDateNormalized.getTime()
  );
}
