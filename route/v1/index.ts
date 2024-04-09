import express from "express";
import auth from "./auth.route";
import user from "./user.route";
import protect from "./protected.route";
import product from "./product.route";
import order from "./order.route";

const router = express.Router();

router.use("/auth", auth);
router.use("/user", user);
router.use("/protected", protect);
router.use("/product", product);
router.use("/order", order);

export default router;
