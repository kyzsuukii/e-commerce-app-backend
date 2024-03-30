import axios from "axios";
import { Request, Response, NextFunction } from "express";

export const reCaptcha = async (
  req: Request<Record<string, unknown>>,
  res: Response,
  next: NextFunction
) => {
  const secretKey = process.env.RECAPTHA_SECRET_KEY;
  const recaptchaToken = req.body["g-recaptcha-token"];

  if (!recaptchaToken) {
    return res.status(400).json({
      msg: "Captcha verification has Failed. Try again.",
    });
  }

  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: secretKey,
          response: recaptchaToken,
          remoteip: req.socket.remoteAddress,
        },
      }
    );

    const verificationResult = response.data;
    const minimumScore = 0.7;

    if (
      verificationResult.success &&
      verificationResult.score >= minimumScore
    ) {
      next();
    } else {
      return res.status(403).json({
        msg: "Captcha verification has Failed. Try again.",
      });
    }
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return res.status(500).json({
      msg: "Error verifying reCAPTCHA. Please try again later.",
    });
  }
};
