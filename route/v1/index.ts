import express from "express";
import auth from "./auth.route";
import user from "./user.route";

const router = express.Router();

router.use("/auth", auth);
router.use("/user", user);

export default router;
