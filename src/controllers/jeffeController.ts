import { Request, Response } from "express";
import { BehaviorSubject } from "rxjs";
import { ConversationState } from "../types/interfaces";
import {
  // handleMessageReturn,
  handleAssistantAction,
  openai,
} from "../services/jeffeService";
import { formatDateToTimezone } from "../helpers/dateHelper";

let threadId: string | null = null;
export const $runObserver: BehaviorSubject<ConversationState> =
  new BehaviorSubject<ConversationState>({
    status: "expired",
  });

$runObserver.subscribe((state) => {
  console.log("Conversation state:", state, threadId);
  if (!threadId) return;

  switch (state.status) {
    case "completed":
      // handleMessageReturn(state.run!, threadId!, state.res!);
      break;
    case "requires_action":
      // handleAssistantAction(state.run!, threadId!);
      break;
    default:
      break;
  }
});

export const communicate = async (req: Request, res: Response) => {
  const { message, timezone }: { message: string; timezone: string } = req.body;

  // Use the helper to format the date to the user's timezone
  const formattedDate = formatDateToTimezone(timezone);
  console.log("Formatted date:", formattedDate);

  const assistantInfo = {
    date: formattedDate,
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

    $runObserver.next({
      ...$runObserver.value,
      run,
      status: run.status,
      date: formattedDate,
      res,
    });
  } catch (aiError) {
    console.error("Error communicating with OpenAI:", aiError);
    res.status(500).send("Failed to communicate with assistant");
  }
};
