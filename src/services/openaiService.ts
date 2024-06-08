import OpenAI from "openai";
import { Run } from "openai/resources/beta/threads/runs/runs";
import { Response } from "express";
import { $runObserver } from "../controllers/assistantController";
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

export async function handleAssistantAction(run: Run, threadId: string) {
  try {
    const parsedFunction = JSON.parse(
      run.required_action?.submit_tool_outputs.tool_calls[0].function
        .arguments ?? ""
    );

    const actionResponse = await handleCalendarAction(parsedFunction);

    console.log("Action response:", actionResponse);

    const sendResponse =
      await openai.beta.threads.runs.submitToolOutputsAndPoll(
        threadId,
        run.id,
        {
          tool_outputs: [
            {
              tool_call_id:
                run.required_action?.submit_tool_outputs.tool_calls[0].id,
              output: JSON.stringify(actionResponse),
            },
          ],
        }
      );

    console.log("Action response sent:", sendResponse);
    $runObserver.next({
      ...$runObserver.value,
      run: sendResponse,
      status: "completed",
    });
  } catch {}
}

async function handleCalendarAction(data: any) {
  console.log("Calendar action data:", data);
  switch (data.action) {
    case "query":
      return await queryEvents(data.date);
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

async function queryEvents(date: string) {
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date(date).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items;
}

async function createEvent({
  date,
  time,
  summary,
  description,
}: {
  date: string;
  time: string;
  summary: string;
  description: string;
}) {
  const event = {
    summary,
    description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
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
  summary,
  description,
}: {
  eventId: string;
  date: string;
  time: string;
  summary: string;
  description: string;
}) {
  const event = {
    summary,
    description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
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
