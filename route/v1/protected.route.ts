import express from "express";
import passport from "passport";

const route = express.Router();

route.post(
  "/admin",
  passport.authenticate("jwt", { session: false }),
  (req: any, res) => {
    const { role } = req.user;
    if (role !== "ADMIN") {
      res.status(401).json({ msg: "Unauthorized" });
    }
    res.json({ msg: "Authorized" });
  }
);

// route.post(
//   "/costumer",
//   passport.authenticate("jwt", { session: false }),
//   (req: any, res) => {
//     const { role } = req.user;
//     if (role !== "COSTUMER") {
//       res.status(401).json({ msg: "Unauthorized" });
//     }
//     res.json({ msg: "Authorized" });
//   }
// );

export default route;
