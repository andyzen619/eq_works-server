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

//tokens used to handle requests
// let tokens = 2;

//Add one token to use for request after five seconds
// setInterval(() => {
//   if (tokens < 5) {
//     tokens++;
//   }
//   console.log(tokens);
// }, 10000);

/**
 * Returns whether or not we have reached limit
 */
// const isLimit = () => {
//   if (tokens > 0) {
//     tokens--;
//     return true;
//   } else {
//     return false;
//   }
// };

/**
 * Rate-limiter for home page
 * @param {} req
 * @param {*} res
 */
const rateLimit = (req, res) => {
  if (!req.cookies.rate) {
    res.cookie("rate", 10, { maxAge: 10000 }).send("Welcome to EQ Works 😎");
  } else {
    if (req.cookies.rate > 0) {
      res
        .cookie("rate", req.cookies.rate - 1, { maxAge: 1000 })
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
  if (!req.cookies.rate) {
    pool
      .query(req.sqlQuery)
      .then(r => {
        return res.cookie("rate", 10, { maxAge: 10000 }).json(r.rows || []);
      })
      .catch(next);
  } else {
    if (req.cookies.rate > 0) {
      pool
        .query(req.sqlQuery)
        .then(r => {
          return res
            .cookie("rate", req.cookies.rate - 1, { maxAge: 10000 })
            .json(r.rows || []);
        })
        .catch(next);
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
    SELECT date, SUM(events) AS events, poi_id
    FROM public.hourly_events
    GROUP BY date, poi_id
    ORDER BY date
    LIMIT 32;
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
        SUM(revenue) AS revenue,
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

app.get(
  "/events/daily/:poi_id",
  (req, res, next) => {
    const poi_id = req.params.poi_id
    req.sqlQuery = `
    SELECT date, SUM(events) AS events, poi_id
    FROM public.hourly_events
    WHERE poi_id = ${poi_id}
    GROUP BY date, poi_id
    ORDER BY date
    LIMIT 7;
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
