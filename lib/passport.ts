import { FieldPacket, QueryResult } from "mysql2";
import { ExtractJwt, Strategy } from "passport-jwt";
import { conn } from "./db";
import passport from "passport";
import { config } from "dotenv";

config();

type Users = [
  {
    id: number;
    email: string;
    password: string;
  }
] &
  QueryResult;

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: `${process.env.JWT_SECRET_KEY}`,
};

export const passportJwt = passport.use(
  new Strategy(jwtOptions, async (payload, done) => {
    const db = await conn();

    try {
      const [users]: [Users, FieldPacket[]] = await db.execute(
        `SELECT * FROM auth WHERE id = ? LIMIT 1`,
        [payload.id]
      );
      if (users[0]) {
        return done(null, users[0]);
      } else {
        return done(null, false);
      }
    } catch (error) {
      return done(error, false);
    }
  })
);
