import express from "express";
import v1Route from "./route/v1";
import passport from "passport";
import { config } from "dotenv";
import { passportJwt } from "./lib/passport";
import cors from "cors";

config();

const port = 3000;
const app = express();

app.use(express.json());
app.use(cors());
app.use(passportJwt.initialize());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get(
  "/me",
  passport.authenticate("jwt", { session: false }),
  (req: any, res) => {
    const { id, email } = req.user;
    res.json({ id, email });
  }
);

app.use("/v1", v1Route);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
