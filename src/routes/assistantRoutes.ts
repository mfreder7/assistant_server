import { Router } from "express";
import { communicate } from "../controllers/assistantController";

const router = Router();

router.post("/communicate", communicate);

export default router;
