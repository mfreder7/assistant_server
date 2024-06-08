import OpenAI from "openai";
import { Run } from "openai/resources/beta/threads/runs/runs";
import { Response } from "express";
import { $runObserver } from "../controllers/jeffeController";
import { calendar } from "../controllers/googleApiController";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function handleMessageReturn(
  run: Run,
  threadId: string,
  res?: Response
) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId);
    console.log("Messages:", messages.data);
    messages.data.forEach((element, index) => {
      if (element.role === "assistant" && element.content[0].type === "text") {
        const text = element.content[0].text.value;
        console.log(`${element.role} > ${text}, INDEX: ${index}`);
        if (index === 0) {
          res?.json({ replies: text });
          res?.send();
        }
      }
    });
  } catch {
    console.error("Error handling messages");
  }
}

export async function handleAssistantAction(parsedFunction: any) {
  try {
    const actionResponse = await handleCalendarAction(parsedFunction);

    console.log("Action response:", actionResponse);

    return actionResponse;
  } catch {}
}

async function handleCalendarAction(data: any) {
  console.log("Calendar action data:", data);
  switch (data.action) {
    case "query":
      return await queryEvents(data?.date, data?.date_end);
    case "create":
      return await createEvent(data);
    case "update":
      return await updateEvent(data);
    case "delete":
      return await deleteEvent(data.eventId);
    default:
      return { error: "Invalid action" };
  }
}

async function queryEvents(date?: string, date_end?: string) {
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: date ? new Date(date).toISOString() : new Date().toISOString(),
    timeMax: date_end ? new Date(date_end).toISOString() : undefined,
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items;
}

async function createEvent({
  date,
  time,
  date_end,
  time_end,
  summary,
  description,
}: {
  date: string;
  time: string;
  date_end: string;
  time_end: string;
  summary: string;
  description: string;
}) {
  const event = {
    summary,
    description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date_end}T${time_end}:00`).toISOString() },
  };
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });
  return response.data;
}

async function updateEvent({
  eventId,
  date,
  time,
  date_end,
  time_end,
  summary,
  description,
}: {
  eventId: string;
  date: string;
  time: string;
  date_end: string;
  time_end: string;
  summary: string;
  description: string;
}) {
  const event = {
    summary,
    description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date_end}T${time_end}:00`).toISOString() },
  };
  const response = await calendar.events.update({
    calendarId: "primary",
    eventId,
    requestBody: event,
  });
  return response.data;
}

async function deleteEvent(eventId: string) {
  const response = await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });

  if (response.status !== 204) {
    return { error: "Failed to delete event" };
  }
  return { message: "Event deleted successfully" };
}
