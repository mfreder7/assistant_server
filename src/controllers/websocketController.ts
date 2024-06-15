import { WebSocket } from "ws";
import { formatDateToTimezone } from "../helpers/dateHelper";
import { handleAssistantAction, openai } from "../services/jeffeService";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

let threadId: string | null = null;

export const handleWebSocketMessage = async (
  ws: WebSocket,
  message: string
) => {
  const timezone = "UTC"; // Assuming timezone is UTC, modify as necessary

  // Use the helper to format the date to the user's timezone
  const formattedDate = formatDateToTimezone(timezone);
  console.log("Formatted date:", formattedDate);

  const assistantInfo = {
    date: formattedDate,
  };

  try {
    if (!threadId) {
      const threadResponse = await openai.beta.threads.create();
      threadId = threadResponse.id;
    }

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: `Current date: ${assistantInfo.date} \n\n` + message,
      metadata: assistantInfo,
    });

    const run = openai.beta.threads.runs.stream(threadId, {
      assistant_id: process.env.ASSISTANT_ID!,
    });

    run
      .on("textCreated", ({ value }) => {
        const finalMessage = { value: value ?? "", completed: false };
        ws.send(JSON.stringify(finalMessage));
      })
      .on("textDelta", ({ value }) => {
        const finalMessage = { value: value ?? "", completed: false };
        ws.send(JSON.stringify(finalMessage));
      })
      .on("textDone", ({ value }) => {
        console.log("Value:", value);
        const finalMessage = { value: value ?? "", completed: true };
        ws.send(JSON.stringify(finalMessage));
      })
      .on("event", (event) => {
        if (event.event === "thread.run.requires_action") {
          const toolCalls =
            event.data.required_action?.submit_tool_outputs.tool_calls;
          const runId = event.data.id;
          const threadId = event.data.thread_id;
          console.log("Tool calls:", toolCalls);

          handleAndSubmitToolCalls(
            ws,
            toolCalls ?? [],
            formattedDate,
            threadId,
            runId
          );
        }
      });
  } catch (aiError) {
    console.error("Error communicating with OpenAI:", aiError);
    ws.send("Failed to communicate with assistant");
  }
};

const handleAndSubmitToolCalls = async (
  ws: WebSocket,
  toolCalls: RequiredActionFunctionToolCall[],
  formattedDate: string,
  threadId: string,
  runId: string
) => {
  const actionResponses = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const parsedFunction = JSON.parse(toolCall.function.arguments ?? "");
      console.log("Parsed action call: \n", parsedFunction);
      const actionResponse = await handleAssistantAction(parsedFunction);
      return {
        tool_call_id: toolCall.id,
        output: JSON.stringify(actionResponse),
      };
    })
  );

  const sendResponseStream = openai.beta.threads.runs.submitToolOutputsStream(
    threadId!,
    runId!,
    {
      tool_outputs: actionResponses,
    }
  );

  sendResponseStream
    .on("textCreated", ({ value }) => {
      const finalMessage = { value: value ?? "", completed: false };
      ws.send(JSON.stringify(finalMessage));
    })
    .on("textDelta", ({ value }) => {
      const finalMessage = { value: value ?? "", completed: false };
      ws.send(JSON.stringify(finalMessage));
    })
    .on("textDone", ({ value }) => {
      console.log("Value:", value);
      const finalMessage = { value: value ?? "", completed: true };
      ws.send(JSON.stringify(finalMessage));
    })
    .on("event", (event) => {
      if (event.event === "thread.run.requires_action") {
        const newToolCalls =
          event.data.required_action?.submit_tool_outputs.tool_calls;
        console.log("New tool calls:", newToolCalls);

        handleAndSubmitToolCalls(
          ws,
          newToolCalls ?? [],
          formattedDate,
          threadId,
          runId
        );
      }
    });
};
