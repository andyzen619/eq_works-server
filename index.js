const { config } = require("dotenv");
const express = require("express");
const pg = require("pg");
const cookieParser = require("cookie-parser");

config();
const app = express();
app.use(cookieParser());

// configs come from standard PostgreSQL env vars
// https://www.postgresql.org/docs/9.6/static/libpq-envars.html
const pool = new pg.Pool();

/**
 * Rate limiter for home route
 * @param {*} req
 * @param {*} res
 */
const rateLimit = (req, res) => {
  if (!req.cookies.rate) {
    res.cookie("rate", 2, { maxAge: 10000 }).send("Welcome to EQ Works 😎");
  } else {
    if (req.cookies.rate > 0) {
      res
        .cookie("rate", req.cookies.rate - 1, { maxAge: 10000 })
        .send("Welcome to EQ Works 😎");
    } else {
      res.send("Request limit reached!!");
    }
  }
};

/**
 * Rate limiter for query routes
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
const queryHandler = (req, res, next) => {
  //Adds cookie to client
  if (!req.cookies.rate) {
    pool
      .query(req.sqlQuery)
      .then(r => {
        return res.cookie("rate", 2, { maxAge: 10000 }).json(r.rows || []);
      })
      .catch(next);
  } else {
    //Decrements request count from client
    if (req.cookies.rate > 0) {
      pool
        .query(req.sqlQuery)
        .then(r => {
          return res
            .cookie("rate", req.cookies.rate - 1, { maxAge: 10000 })
            .json(r.rows || []);
        })
        .catch(next);

      //handles request limit reached
    } else {
      res.send("Request limit reached!!");
    }
  }
};

app.get("/", (req, res) => {
  rateLimit(req, res);
});

app.get(
  "/events/hourly",
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, hour, events
    FROM public.hourly_events
    ORDER BY date, hour
    LIMIT 168;
  `;
    return next();
  },
  queryHandler
);

app.get(
  "/events/daily",
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, SUM(events) AS events
    FROM public.hourly_events
    GROUP BY date
    ORDER BY date
    LIMIT 7;
  `;
    return next();
  },
  queryHandler
);

app.get(
  "/stats/hourly",
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date, hour, impressions, clicks, revenue
    FROM public.hourly_stats
    ORDER BY date, hour
    LIMIT 168;
  `;
    return next();
  },
  queryHandler
);

app.get(
  "/stats/daily",
  (req, res, next) => {
    req.sqlQuery = `
    SELECT date,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(revenue) AS revenue
    FROM public.hourly_stats
    GROUP BY date
    ORDER BY date
    LIMIT 7;
  `;
    return next();
  },
  queryHandler
);

app.get(
  "/poi",
  (req, res, next) => {
    req.sqlQuery = `
    SELECT *
    FROM public.poi;
  `;
    return next();
  },
  queryHandler
);

app.listen(process.env.PORT || 5555, err => {
  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    console.log(`Running on ${process.env.PORT || 5555}`);
  }
});

// last resorts
process.on("uncaughtException", err => {
  console.log(`Caught exception: ${err}`);
  process.exit(1);
});
process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
  process.exit(1);
});
