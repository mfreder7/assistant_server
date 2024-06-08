import { Router } from "express";
import { communicate } from "../controllers/jeffeController";

const router = Router();

router.post("/communicate", communicate);

export default router;
