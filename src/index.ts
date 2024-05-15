import express, { Request, Response } from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Setup Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:3000/oauth2callback"
);

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let threadId: string | null = null; // Store the thread ID here

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Redirect user to the Google authentication page
app.get("/auth", (req: Request, res: Response) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(url);
});

// Handle OAuth2 callback
app.get("/oauth2callback", async (req: Request, res: Response) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code as string);
    oauth2Client.setCredentials(tokens);
    res.send("Authentication successful! You can now use the API.");
    console.log(tokens); // You can store these tokens as needed
  } catch (error) {
    console.error("Error during authentication:", error);
    res.status(500).send("Authentication failed");
  }
});

interface ManageCalendarRequest {
  action: "query" | "create" | "update" | "delete";
  date?: string;
  time?: string;
  summary?: string;
  description?: string;
  eventId?: string;
}

app.post("/communicate", async (req: Request, res: Response) => {
  const { message }: { message: string } = req.body;

  const assistantInfo = {
    date: new Date().toISOString(),
  };

  try {
    if (!threadId) {
      const threadResponse = await openai.beta.threads.create();
      console.log("New thread created:", threadResponse);
      threadId = threadResponse.id;
    }

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: `Current date: ${assistantInfo.date} \n\n` + message,
      metadata: assistantInfo,
    });

    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: process.env.ASSISTANT_ID!,
    });

    console.log("Run status:", run.status);

    if (run.status === "completed") {
      const messages = await openai.beta.threads.messages.list(threadId);
      console.log("Messages:", messages.data);
      messages.data.forEach((element, index) => {
        if (
          element.role === "assistant" &&
          element.content[0].type === "text"
        ) {
          const text = element.content[0].text.value;
          console.log(`${element.role} > ${text}, INDEX: ${index}`);
          if (index === 0) {
            res.json({ replies: text });
          }
        }
      });
    } else if (run.status === "requires_action") {
      try {
        const parsedFunction = JSON.parse(
          run.required_action?.submit_tool_outputs.tool_calls[0].function
            .arguments ?? ""
        );

        const actionResponse = await handleCalendarAction(parsedFunction);

        console.log("Action response:", actionResponse);

        const sendResponse = await openai.beta.threads.runs.submitToolOutputs(
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

        res.json({ replies: "Action response sent" });
      } catch {
        console.error("Error parsing assistant function call:", run);
        res.status(500).send("Failed to parse assistant function call");
      }
    } else {
      res.status(500).send(run.status);
      console.error("Assistant run failed:", run);
    }
  } catch (aiError) {
    console.error("Error communicating with OpenAI:", aiError);
    res.status(500).send("Failed to communicate with assistant");
  }
});

async function handleCalendarAction(data: any) {
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
  return response.data;
}