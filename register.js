const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();



const app = express();


// Middleware
app.use(cors());
app.use(bodyParser.json());

// //MySQL connection



const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

});
// console.log('DB_HOST:', process.env.DB_HOST);
// console.log('DB_USER:', process.env.DB_USER);
// console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
// console.log('DB_NAME:', process.env.DB_NAME);
// Connect to MySQL
db.connect((err) => {
if (err) {
  throw err;
}
console.log('MySQL connected...');
}); 


app.get('/', (req, res) => {
  return res.json('From Kigogo Backend');
});

// Function to validate phone number
const isValidPhoneNumber = (phone_number) => {
  const phoneRegex = /^0\d{9}$/; // Must start with 0 and be exactly 10 digits
  return phoneRegex.test(phone_number);
};

// Function to validate password
const isValidPassword = (password) => {
  return password.length >= 4 && password.length <= 8; // Password length should be between 4 and 8 characters
};

// Registration endpoint

app.post('/register', (req, res) => {
  const {
    phone_number,
    user_name,
    password,
    tiktok_name,
    youtube_name,
    instagram_name,
    referral_code,
  } = req.body;

  // Check for required fields
  if (!phone_number || !user_name || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  // Validate phone number
  if (!isValidPhoneNumber(phone_number)) {
    return res.status(400).json({ message: 'Phone number must be exactly 10 digits and start with 0.' });
  }

  // Validate password
  if (!isValidPassword(password)) {
    return res.status(400).json({ message: 'Password must be between 4 and 8 characters.' });
  }

  // Check if the phone number already exists
  const phoneCheckQuery = 'SELECT * FROM users WHERE phone_number = ?';
  db.query(phoneCheckQuery, [phone_number], (phoneCheckError, phoneCheckResults) => {
    if (phoneCheckError) {
      console.error('Database error while checking phone number:', phoneCheckError);
      return res.status(500).json({ message: 'Error checking phone number.' });
    }

    if (phoneCheckResults.length > 0) {
      return res.status(400).json({ message: 'Phone number already exists.' });
    }

    // Check if the referral code exists
    let userWithReferralCode;
    const referralQuery = 'SELECT * FROM users WHERE referral_code = ?';

    db.query(referralQuery, [referral_code], (referralError, referralResults) => {
      if (referralError) {
        console.error('Database error while checking referral code:', referralError);
        return res.status(500).json({ message: 'Error checking referral code.' });
      }

      // If the referral code does not exist, return an error
      if (referralResults.length === 0) {
        return res.status(400).json({ message: 'Invalid referral code.' });
      }

      userWithReferralCode = referralResults[0];

      // Increment the referrals count for the user with the referral code
      const updateReferralCountQuery = 'UPDATE users SET referrals = referrals + 1 WHERE id = ?';
      db.query(updateReferralCountQuery, [userWithReferralCode.id], (updateError) => {
        if (updateError) {
          console.error('Database error while updating referrals:', updateError);
          return res.status(500).json({ message: 'Error updating referrals.' });
        }

        // Function to generate a unique referral code
        const generateReferralCode = () => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const numbers = '0123456789';
          const randomLetters = Array.from({ length: 3 }, () => letters.charAt(Math.floor(Math.random() * letters.length))).join('');
          const randomNumbers = Array.from({ length: 3 }, () => numbers.charAt(Math.floor(Math.random() * numbers.length))).join('');
          return `${randomLetters}${randomNumbers}`;
        };

        // Generate a unique referral code
        let newReferralCode;
        const checkReferralCode = (code, callback) => {
          const codeCheckQuery = 'SELECT * FROM users WHERE referral_code = ?';
          db.query(codeCheckQuery, [code], (error, results) => {
            if (error) {
              callback(true);
            } else {
              callback(results.length > 0);
            }
          });
        };

        // Check for a unique referral code
        const findUniqueReferralCode = () => {
          newReferralCode = generateReferralCode();
          checkReferralCode(newReferralCode, (exists) => {
            if (exists) {
              // If the code exists, generate a new one
              findUniqueReferralCode();
            } else {
              // Insert the new user with the unique referral code and referredBy field
              registerUser(newReferralCode);
            }
          });
        };

        // Function to insert the new user
        const registerUser = (referralCode) => {
          // Hash the password
          bcrypt.hash(password, 10, (hashError, hash) => {
            if (hashError) {
              return res.status(500).json({ message: 'Error hashing password.' });
            }

            const insertQuery = `
              INSERT INTO users 
              (phone_number, user_name, password, tiktok_name, youtube_name, instagram_name, referral_code, referredBy, 
              bonusAmountTL, bonusAmountRefs, bonusAmountTasks, balance, referrals) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.query(insertQuery, [
              phone_number,
              user_name,
              hash,
              tiktok_name,
              youtube_name,
              instagram_name,
              referralCode,
              referral_code, // referredBy column now stores the code the user joined with
              0, // bonusAmountTL
              0, // bonusAmountRefs
              0, // bonusAmountTasks
              100, // balance
              0, // referrals
            ], (insertError) => {
              if (insertError) {
                console.error('Database error while creating user:', insertError);
                return res.status(500).json({ message: 'Error creating user.', error: insertError });
              }
              res.status(201).json({ message: 'User created successfully.', referral_code: newReferralCode });
            });
          });
        };

        // Start checking for a unique referral code
        findUniqueReferralCode();
      });
    });
  });
});


app.post('/login', (req, res) => {
  const { phone_number, password } = req.body;

  // Check for required fields
  if (!phone_number || !password) {
    return res.status(400).json({ message: 'Phone number and password are required.' });
  }

  // Query to find the user by phone number
  const query = 'SELECT * FROM users WHERE phone_number = ?';
  db.query(query, [phone_number], (error, results) => {
    if (error) {
      console.error('Database error during login:', error);
      return res.status(500).json({ message: 'Error during login.' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid phone number or password.' });
    }

    const user = results[0];

    // Compare password with the stored hash
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: 'Error during password comparison.' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid phone number or password.' });
      }

      // Successful login: Send back user data (excluding the password)
      const { password, ...userData } = user; // Exclude password from the response
      res.status(200).json({ message: 'Login successful.', user: userData });
    });
  });
});


app.post('/withdraw', (req, res) => {
  const { phone_number, amount } = req.body;

  // Check if the user exists and has enough balance
  const query = 'SELECT * FROM users WHERE phone_number = ?';
  db.query(query, [phone_number], (error, results) => {
    if (error) {
      return res.status(500).json({ message: 'Database error.' });
    }

    if (results.length === 0 || results[0].balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance or user not found.' });
    }

    const currentBalance = results[0].balance;

    // Ensure balance doesn't go below Ksh. 100
    if (currentBalance - amount < 100) {
      return res.status(400).json({ success: false, message: 'Insufficient balance. Cannot leave less than Ksh. 100.' });
    }

    // Update user balance
    const updatedBalance = currentBalance - amount;
    const updateQuery = 'UPDATE users SET balance = ? WHERE phone_number = ?';
    db.query(updateQuery, [updatedBalance, phone_number], (updateError) => {
      if (updateError) {
        return res.status(500).json({ message: 'Error updating balance.' });
      }

      // Insert the withdrawal into the withdrawals table
      const insertWithdrawalQuery = `
        INSERT INTO withdrawals (user_id, phone_number, amount) 
        VALUES (?, ?, ?)
      `;
      const userId = results[0].id; // Assuming the 'users' table has a column 'id'

      db.query(insertWithdrawalQuery, [userId, phone_number, amount], (insertError) => {
        if (insertError) {
          return res.status(500).json({ message: 'Error logging withdrawal.' });
        }

        // If everything is successful, send a success response
        res.status(200).json({ success: true, message: 'Withdrawal successful.' });
      });
    });
  });
});

app.get('/my-team', (req, res) => {
  const referralCode = req.query.referral_code; // Get referral code from query

  if (!referralCode) {
    return res.status(400).json({ message: 'Referral code is required.' });
  }

  const query = 'SELECT user_name, phone_number FROM users WHERE referredBy = ?';
  
  db.query(query, [referralCode], (error, results) => {
    if (error) {
      return res.status(500).json({ message: 'Error fetching team members.' });
    }
    res.status(200).json(results); // Send back the list of team members
  });
});

// Endpoint to fetch teams by referral code
app.get('/teams', (req, res) => {
  // Query to get all users without fetching the balance
  const query = 'SELECT user_name, phone_number, referral_code, referredBy FROM users';

  db.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ message: 'Error fetching users.' });
    }

    // Organize users into teams based on referredBy and referral_code
    const teams = {};
    const leaders = {};

    results.forEach(user => {
      // If this user has a referral code and no referredBy, they are a potential team leader
      if (user.referral_code) {
        leaders[user.referral_code] = user;
      }

      // If the user has a referredBy value, they are part of a team
      if (user.referredBy) {
        if (!teams[user.referredBy]) {
          teams[user.referredBy] = [];
        }
        teams[user.referredBy].push(user);
      }
    });

    // Construct the response to include the leader and their team members
    const teamData = Object.keys(teams).map(referralCode => {
      const leader = leaders[referralCode] || null; // Find the team leader by referral code
      const teamMembers = teams[referralCode];
      return {
        leader,
        teamMembers
      };
    });

    res.status(200).json(teamData);
  });
});

app.post('/deals', (req, res) => {
  const { dealCode, email, name, phoneNumber, accountName } = req.body;

  // Validate input
  if (!dealCode || !email || !name || !phoneNumber || !accountName) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Fetch the user from the database
  const query = 'SELECT id FROM users WHERE phone_number = ?';
  db.query(query, [phoneNumber], (error, results) => {
      if (error) {
          console.error('Error fetching user:', error);
          return res.status(500).json({ success: false, message: 'Internal server error.' });
      }

      if (results.length === 0) {
          return res.status(400).json({ success: false, message: 'Phone number does not match any user.' });
      }

      const userId = results[0].id; // Get the user ID

      // Insert the submitted deal into the submitted_deals table
      const insertQuery = 'INSERT INTO submitted_deals (user_id, deal_code, email, name, phone_number, account_name) VALUES (?, ?, ?, ?, ?, ?)';
      db.query(insertQuery, [userId, dealCode, email, name, phoneNumber, accountName], (insertError, insertResults) => {
          if (insertError) {
              console.error('Error inserting deal:', insertError);
              return res.status(500).json({ success: false, message: 'Internal server error.' });
          }

          return res.status(201).json({ success: true, message: 'Deal submitted successfully.' });
      });
  });
});

app.post('/submit-tasks', (req, res) => {
  const { phone_number } = req.body;

  // Validate the phone_number
  if (!phone_number) {
    return res.status(400).json({ success: false, message: 'phone_number is required.' });
  }

  // Update the submitted status for the user
  const query = 'UPDATE users SET submitted = ? WHERE phone_number = ?'; // Adjust as needed

  db.query(query, [true, phone_number], (error, results) => {
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ success: false, message: 'Error submitting tasks.' });
    }

    if (results.affectedRows > 0) {
      // Increase balance by 100 for users whose submitted status is now true
      const updateBalanceQuery = 'UPDATE users SET balance = balance + 20 WHERE submitted = true';

      db.query(updateBalanceQuery, (balanceError) => {
        if (balanceError) {
          console.error('Error updating balance:', balanceError);
          return res.status(500).json({ success: false, message: 'Error updating balance.' });
        }

        res.json({ success: true, message: 'Tasks submitted successfully and balance updated.' });
      });
    } else {
      res.json({ success: false, message: 'User not found or tasks already submitted.' });
    }
  });
});


app.post('/api/deals', (req, res) => {
  const { dealCode, email, name, phoneNumber, accountName } = req.body;

  // Validate input
  if (!dealCode || !email || !name || !phoneNumber || !accountName) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const query = 'INSERT INTO deals (dealCode, email, name, phoneNumber, accountName) VALUES (?, ?, ?, ?, ?)';

  db.query(query, [dealCode, email, name, phoneNumber, accountName], (error, results) => {
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ success: false, message: 'Error creating deal.' });
    }

    res.json({ success: true, message: 'Deal created successfully.' });
  });
});


//mpesa 
const TokenRoute = require("./routes/token");
app.use(express.json());
app.use(cors());
app.get("/", (req, res) => {
res.send("Kigogo on the server");
});
app.use("/token", TokenRoute);


app.post('/claim-bonus', (req, res) => {
  const { userId } = req.body;

  // Ensure userId is provided
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  const updateQuery = `
    UPDATE users 
    SET balance = balance + 100,
        bonusAmountTasks = 0,
        bonusAmountRefs = 0,
        bonusAmountTL = 0 
    WHERE id = ?`;

  db.query(updateQuery, [userId], (error, results) => {
    if (error) {
      console.error('Database error while claiming bonus:', error);
      return res.status(500).json({ message: 'Error claiming bonus.' });
    }

    res.status(200).json({ message: 'Bonus claimed successfully! Your balance has been updated.' });
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
// app.listen();