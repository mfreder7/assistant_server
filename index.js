const express = require("express");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const OpenAI = require("openai");

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

let threadId = null; // Store the thread ID here

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Redirect user to the Google authentication page
app.get("/auth", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(url);
});

// Handle OAuth2 callback
app.get("/oauth2callback", async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    res.send("Authentication successful! You can now use the API.");
    console.log(tokens); // You can store these tokens as needed
  } catch (error) {
    console.error("Error during authentication:", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/manageCalendar", async (req, res) => {
  const { action, date, time, summary, description, eventId } = req.body;

  try {
    switch (action) {
      case "query":
        const events = await queryEvents(date);
        res.json(events);
        break;
      case "create":
        const event = await createEvent({ date, time, summary, description });
        res.json(event);
        break;
      case "update":
        const updatedEvent = await updateEvent({
          eventId,
          date,
          time,
          summary,
          description,
        });
        res.json(updatedEvent);
        break;
      case "delete":
        const deleteResponse = await deleteEvent(eventId);
        res.json(deleteResponse);
        break;
      default:
        res.status(400).send("Invalid action");
    }
  } catch (error) {
    console.error("Error managing calendar:", error);
    res.status(500).send(error.message);
  }
});

// New endpoint to communicate with OpenAI assistant
app.post("/communicate", async (req, res) => {
  const { message } = req.body;

  // Basic information for the AI assistant to be expected to know. IE. The current date epoch time in milliseconds, user info (TODO: implement user info retrieval), location (), weather forecast (TODO).
  const assistantInfo = {
    // date from the user
    date: new Date().toISOString(),
  };

  try {
    // If threadId is null, create a new thread
    if (!threadId) {
      const threadResponse = await openai.beta.threads.create();
      console.log("New thread created:", threadResponse);
      threadId = threadResponse.id;
    }

    // Create a new message in the existing thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: `Current date: ${assistantInfo.date} \n\n` + message,
      metadata: assistantInfo,
    });

    // Send the message to the assistant
    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // status log
    console.log("Run status:", run.status);

    if (run.status === "completed") {
      const messages = await openai.beta.threads.messages.list(threadId);
      console.log("Messages:", messages.data);
      await messages.data.forEach((element, index) => {
        if (element.role === "assistant") {
          const text = element.content[0].text.value;
          console.log(`${element.role} > ${text}, INDEX: ${index}`);
          // get last message from assistant
          if (index === 0) {
            res.json({ replies: text });
          }
        }
        res.send;
      });
    } else if (run.status === "requires_action") {
      try {
        const parsedFunction = JSON.parse(
          run.required_action.submit_tool_outputs.tool_calls[0].function
            .arguments
        );

        const actionResponse = await handleCalendarAction(parsedFunction);

        console.log("Action response:", actionResponse);

        // Send the response back to the assistant
        // Example:
        // await openai.beta.threads.runs.submitToolOutputs(
        //   "thread_123",
        //   "run_123",
        //   {
        //     tool_outputs: [
        //       {
        //         tool_call_id: "call_001",
        //         output: "70 degrees and sunny.",
        //       },
        //     ],
        //   }
        // );

        const sendResponse = await openai.beta.threads.runs.submitToolOutputs(
          threadId,
          run.id,
          {
            tool_outputs: [
              {
                tool_call_id:
                  run.required_action.submit_tool_outputs.tool_calls[0].id,
                output: JSON.stringify(actionResponse),
              },
            ],
          }
        );

        console.log("Action response sent:", sendResponse);

        res.json({ replies: "Action response sent" });

        // TODO: Handle the response from the assistant
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

async function handleCalendarAction(data) {
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

async function queryEvents(date) {
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date(date).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items;
}

async function createEvent({ date, time, summary, description }) {
  const event = {
    summary: summary,
    description: description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
  };
  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });
  return response.data;
}

async function updateEvent({ eventId, date, time, summary, description }) {
  const event = {
    summary: summary,
    description: description,
    start: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
    end: { dateTime: new Date(`${date}T${time}:00`).toISOString() },
  };
  const response = await calendar.events.update({
    calendarId: "primary",
    eventId: eventId,
    resource: event,
  });
  return response.data;
}

async function deleteEvent(eventId) {
  const response = await calendar.events.delete({
    calendarId: "primary",
    eventId: eventId,
  });
  return response.data;
}
