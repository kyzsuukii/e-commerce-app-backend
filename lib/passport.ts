import { FieldPacket, QueryResult } from "mysql2";
import { ExtractJwt, Strategy } from "passport-jwt";
import passport from "passport";
import { config } from "dotenv";
import { prisma } from "./db";

config();

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: `${process.env.JWT_SECRET_KEY}`,
};

export const passportJwt = passport.use(
  new Strategy(jwtOptions, async (payload, done) => {

    try {
      const users = await prisma.users.findFirst({
        where: {
          id: payload.id
        }
      })
      if (users) {
        return done(null, users);
      } else {
        return done(null, false);
      }
    } catch (error) {
      return done(error, false);
    }
  })
);
