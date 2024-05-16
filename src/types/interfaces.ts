import { Run, RunStatus } from "openai/resources/beta/threads/runs/runs";
import { Response } from "express";

//  create interfaces for tracking the conversation state
export interface ConversationState {
  // TODO: Use summary and timestamps to log in a vector database for easy recollection
  date?: string;
  time?: string;
  summary?: string;
  description?: string;
  eventId?: string;
  runId?: string;
  run?: Run;
  //for responding to the user
  res?: Response;
  status: RunStatus;
}
