import { Router } from "express";
import {
  authenticate,
  oauth2callback,
} from "../controllers/googleApiController";

const router = Router();

router.get("/auth", authenticate);
router.get("/oauth2callback", oauth2callback);

export default router;
