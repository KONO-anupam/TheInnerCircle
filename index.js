require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const passport = require("passport");
const session = require("express-session");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const prisma = require("./db");
const flash = require("connect-flash");

const authRoutes = require("./routes/auth");
const app = express();

console.log("🚀 Starting Express application...");

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000, //ms
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
    name: "members_only_session", // Session name
    secret: process.env.SESSION_SECRET || "cats",
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiry on activity
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === 'production', // Set to true in production with HTTPS
      httpOnly: true, // Prevent XSS attacks
      sameSite: "lax", // CSRF protection
    },
  })
);

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.error = req.flash("error");
  res.locals.successMessage = req.flash("successMessage");
  next();
});

// Routes
app.use("/", authRoutes);

app.get("/", (req, res) => {
  res.render("index", { 
    title: "Home"
  });
});

app.get("/register", (req, res) => {
  res.render("register", {
    title: "Register",
    error: req.flash("error") || [],
    formData: req.flash("formData")[0] || {},
  });
});

app.get("/login", (req, res) => {
  const successMessage = req.flash("success");
  res.render("login", {
    title: "Login",
    successMessage,
    error: req.flash("error"),
  });
});

app.get("/become-member", ensureLoggedIn, (req, res) => {
  res.render("become-member", {
    title: "Become a Member",
    error: req.flash("error"),
    successMessage: req.flash("successMessage"),
  });
});

app.get("/create-message", ensureLoggedIn, (req, res) => {
  if (!req.user.is_member) {
    req.flash("error", "You need to become a member first to create messages.");
    return res.redirect("/become-member");
  }
  res.render("create-message", {
    title: "Create Message",
    error: null,
  });
});

app.post("/create-message", ensureLoggedIn, async (req, res) => {
  if (!req.user.is_member) {
    return res.status(403).send("Only members can create messages.");
  }

  const { title, text } = req.body;

  // Basic validation
  if (!title || !text) {
    return res.render("create-message", {
      title: "Create Message",
      error: "Both title and message content are required.",
    });
  }

  try {
    await prisma.message.create({
      data: {
        title: title.trim(),
        content: text.trim(),
        author_id: req.user.id,
      },
    });
    req.flash("successMessage", "Message created successfully!");
    res.redirect("/messages");
  } catch (error) {
    console.error("Error creating message:", error);
    res.render("create-message", {
      title: "Create Message",
      error: "Failed to create message. Please try again.",
    });
  }
});

app.get("/get-the-code", (req, res) => {
  res.render("get-the-code", {
    title: "Get the Code",
    memberCode: process.env.MEMBER_SECRET_CODE,
  });
});

app.post("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    req.flash("successMessage", "You have been logged out successfully.");
    res.redirect("/");
  });
});

// Self-pinging route to keep the server alive
app.get("/self-ping", (req, res) => {
  res.status(200).send("Pinged self.");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    error: {}
  });
});

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Start self-pinging only in production
  if (process.env.NODE_ENV === "production") {
    setInterval(() => {
      fetch(`${APP_URL}/self-ping`)
        .then((res) => {
          if (res.ok) {
            console.log("Self-ping successful.");
          } else {
            console.error("Self-ping failed:", res.statusText);
          }
        })
        .catch((err) => console.error("Error during self-ping:", err));
    }, 13 * 60 * 1000); // 13 minutes
  }
});