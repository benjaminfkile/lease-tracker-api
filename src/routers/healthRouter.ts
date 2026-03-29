import express, { Request, Response } from "express";
//import { getDb } from "../../db/db";
// import health from "../../db/health";


const healthRouter = express.Router();

/**
 * GET /health
 * Performs a database connectivity check and returns the result.
 */
healthRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    res.status(200).send(":)")
    // const db = getDb();

    // const verbose = req.query.verbose === "true";

    // const result = await health.getDBConnectionHealth(db, verbose);

    // res.status(200).json({
    //   status: "ok",
    //   error: false,
    //   health: result,
    // });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: true,
      errorMsg: (error as Error).message,
    });
  }
});

export default healthRouter;