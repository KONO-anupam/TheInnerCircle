const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const router = express.Router();
const prisma = require("../db.js");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Passport configuration
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
    });
    done(null, user);
  } catch (error) {
    console.error("Deserialize user error:", error);
    done(error, null);
  }
});

passport.use(
  new LocalStrategy(
    {
      usernameField: 'username',
      passwordField: 'password'
    },
    async (username, password, done) => {
      try {
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: username },
              { email: username }
            ],
          },
        });

        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid password" });
        }

        return done(null, user);
      } catch (error) {
        console.error("Login error:", error);
        return done(error);
      }
    }
  )
);

// Login route
router.post(
  "/login",
  [
    body("username")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Username or email is required")
      .escape(),
    body("password")
      .isLength({ min: 1 })
      .withMessage("Password is required"),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      req.flash("error", errorMessages.join(". "));
      return res.redirect("/login");
    }

    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("Authentication error:", err);
        req.flash("error", "An error occurred during login.");
        return res.redirect("/login");
      }
      
      if (!user) {
        req.flash("error", info.message || "Login failed.");
        return res.redirect("/login");
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          req.flash("error", "An error occurred during login.");
          return res.redirect("/login");
        }
        
        req.flash("successMessage", "Login successful!");
        return res.redirect("/messages");
      });
    })(req, res, next);
  }
);

// Register route
router.post(
  "/register",
  [
    body("first_name")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("First name must be between 2 and 50 characters")
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage("First name can only contain letters and spaces"),

    body("last_name")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Last name must be between 2 and 50 characters")
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage("Last name can only contain letters and spaces"),

    body("username")
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage("Username must be between 3 and 30 characters")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage("Username can only contain letters, numbers, and underscores"),

    body("email")
      .trim()
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail(),

    body("password")
      .isLength({ min: 6, max: 100 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Password must contain at least one lowercase letter, one uppercase letter, and one number"),

    body("confirm_password").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        req.flash("error", errors.array()[0].msg);
        req.flash("formData", req.body);
        return res.redirect("/register");
      }

      const { first_name, last_name, username, email, password, admin_code } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { 
          OR: [
            { username: username.trim() }, 
            { email: email.trim() }
          ] 
        },
      });

      if (existingUser) {
        req.flash("error", "Username or email already exists. Please choose different ones.");
        req.flash("formData", req.body);
        return res.redirect("/register");
      }

      const isAdmin = admin_code === process.env.ADMIN_SECRET_CODE;
      const isMember = isAdmin; // Admins are automatically members

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      await prisma.user.create({
        data: {
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          username: username.trim(),
          email: email.trim(),
          password: hashedPassword,
          is_admin: isAdmin,
          is_member: isMember,
        },
      });

      req.flash("success", "Registration successful! Please log in with your credentials.");
      res.redirect("/login");
    } catch (error) {
      console.error("Registration error:", error);
      req.flash("error", "An error occurred during registration. Please try again.");
      req.flash("formData", req.body);
      return res.redirect("/register");
    }
  }
);

// Become member route
router.post(
  "/become-member",
  ensureLoggedIn,
  [
    body("secret_code")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Passcode is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash("error", errors.array()[0].msg);
      return res.redirect("/become-member");
    }

    try {
      const { secret_code } = req.body;

      if (secret_code !== process.env.MEMBER_SECRET_CODE) {
        req.flash("error", "Incorrect passcode. Please try again.");
        return res.redirect("/become-member");
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: { is_member: true },
      });

      // Update the user in the current session
      req.user.is_member = true;

      req.flash("successMessage", "Congratulations! You are now a full member.");
      res.redirect("/messages");
    } catch (error) {
      console.error("Membership update error:", error);
      req.flash("error", "An error occurred while updating your membership.");
      res.redirect("/become-member");
    }
  }
);

// Messages route
router.get("/messages", ensureLoggedIn, async (req, res) => {
  try {
    const messagesFromDb = await prisma.message.findMany({
      include: {
        author: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    const messages = messagesFromDb.map((msg) => ({
      id: msg.id,
      title: msg.title,
      text: msg.content,
      timestamp: msg.created_at,
      user: msg.author,
      is_admin: req.user.is_admin,
    }));

    return res.render("dashboard", {
      title: "Messages",
      messages: messages,
      successMessage: req.flash("successMessage"),
      error: req.flash("error"),
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.render("dashboard", {
      title: "Messages",
      error: "An error occurred while fetching messages. Please try again.",
      messages: [],
      successMessage: null,
    });
  }
});

// Delete message route
router.post("/delete-message/:id", ensureLoggedIn, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).send("You are not authorized to delete messages.");
    }

    const messageId = parseInt(req.params.id, 10);
    
    if (isNaN(messageId)) {
      req.flash("error", "Invalid message ID.");
      return res.redirect("/messages");
    }

    await prisma.message.delete({ 
      where: { id: messageId } 
    });
    
    req.flash("successMessage", "Message deleted successfully.");
    res.redirect("/messages");
  } catch (error) {
    console.error("Error deleting message:", error);
    req.flash("error", "Error deleting message.");
    res.redirect("/messages");
  }
});

module.exports = router;