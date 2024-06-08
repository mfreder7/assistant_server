import { openai } from "./JeffeService";

import OpenAI from "openai";
import { Run } from "openai/resources/beta/threads/runs/runs";
import { Response } from "express";
import { $runObserver } from "../controllers/jeffeController";
import { calendar } from "../controllers/googleApiController";

// Atomicist Service
export async function atomicistService(calendarId: string, res?: Response) {
  try {
    // Watch for changes in the calendar
    const channel = await calendar.events.watch({
      calendarId: "primary",
      requestBody: {
        id: process.env.ATOMOCIST_ID!,
        type: "web_hook",
        address: process.env.WEBHOOK_URL!,
      },
    });

    // Handle calendar changes
    channel.on("change", async (event) => {
      const insights = await generateInsights(event);
      await sendInsightsToJeffe(insights);
    });

    console.log("Atomicist service initialized:", channel);
  } catch (error) {
    console.error("Error initializing atomicist service:", error);
  }
}

// Generate insights based on calendar changes
async function generateInsights(event: any) {
  // Generate insights using OpenAI based on the calendar event
  const completion = await openai.completions.create({
    model: "text-davinci-003",
    prompt: `Analyze the following calendar event and provide insights and suggestions for Jeffe:\n\n${JSON.stringify(
      event
    )}`,
    max_tokens: 150,
  });

  return completion.choices[0].text.trim();
}

// Send insights to Jeffe
async function sendInsightsToJeffe(insights: string) {
  try {
    const run = await openai.beta.threads.runs.create({
      model: "text-davinci-003",
      assistant_id: process.env.JEFFE_ID!,
      input: {
        messages: [
          {
            role: "assistant",
            content: { type: "text", text: { value: insights } },
          },
        ],
      },
    });

    console.log("Insights sent to Jeffe:", run);
  } catch (error) {
    console.error("Error sending insights to Jeffe:", error);
  }
}

// Export handleCalendarChange function
export async function handleCalendarChange(req: any, res: Response) {
  try {
    const event = req.body;
    const insights = await generateInsights(event);
    await sendInsightsToJeffe(insights);
    res.status(200).send({ message: "Insights generated and sent to Jeffe" });
  } catch (error) {
    console.error("Error handling calendar change:", error);
    res.status(500).send({ error: "Failed to handle calendar change" });
  }
}

// Initialize the Atomicist service
atomicistService("primary");
