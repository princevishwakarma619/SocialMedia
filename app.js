const mysql = require("mysql");
const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const moment = require('moment');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);


const storage = multer.diskStorage({
    destination: './uploads',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "iaastha"
});

connection.connect(function (error) {
    if (error) throw error;
    else console.log("Connection Established");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname + "/public")));

app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: 'Do_not_disturb',
    resave: false,
    saveUninitialized: true
}));

const secretKey = 'Do_not_disturb';


app.get("/register", function (req, res) {
    res.sendFile(__dirname + "/newaccount.html");
});

app.post("/register", (req, res) => {
    const { fname, lname, uname, mobile, password } = req.body;
    const sql = "INSERT INTO users (first_name, last_name, username, mobile, password) VALUE (?, ?, ?, ?, ?)";
    connection.query(sql, [fname, lname, uname, mobile, password], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error in registering user");
        }
        else {
            res.redirect("/login");
            res.end();
        }
    });
});

app.post('/login', (req, res) => {
    const { uname, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
    connection.query(sql, [uname, password], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error");
        } else if (result.length === 0) {
            res.redirect("/login");
        } else {

            const token = jwt.sign({ id: result[0].id }, secretKey, {
                expiresIn: 6000000000000000
            });
            req.session.token = token;
            console.log("Token: ", token);
            res.redirect("/dashboard");
            // res.status(200).send({ auth: true, token: token });
        }
    });
});

app.get("/login", function (req, res) {
    if (req.session.isLoggedIn) {
        res.redirect("/dashboard");
    } else {
        res.sendFile(__dirname + "/socialmedia.html");
    }
});

const verifyToken = (req, res, next) => {
    const token = req.session.token;

    if (!token) {
        return res.status(403).send({ auth: false, message: 'No token provided.' });
    }

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
        }

        req.userId = decoded.id;
        next();
    });
};
app.get('/dashboard', verifyToken, (req, res) => {
    res.sendFile(__dirname + "/dashboard.html");

});

app.get('/logout', function (req, res) {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error");
        } else {
            res.clearCookie('connect.sid');
            res.redirect("/login");
        }
    });
});

app.post('/upload', upload.single('image'), verifyToken, (req, res) => {
    if (!req.file) {
        res.redirect("/allphotos");
        return;
    }
    const image = req.file;
    const imageName = image.filename;
    const imagePath = image.path;
    const { caption } = req.body;

    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;

    const sql = 'INSERT INTO posts (user_id,caption,image_path) VALUES (?, ?, ?)';
    connection.query(sql, [userId, caption, imagePath], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error uploading image');
        } else {

            res.redirect("/dashboard");
        }
    });
});
app.get('/posts', verifyToken, (req, res) => {
    res.sendFile(__dirname + "/posts.html");
});

app.get('/allphotos', verifyToken, (req, res) => {
    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;
    const sql = 'SELECT * FROM posts WHERE user_id = ?';
    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error fetching images');
        } else {
            if (results.length > 0) {

                const imageTags = results.map(result => `
                <center><img src="${result.image_path}" alt="Image" width="400" height= "600"><br><p style="font-size: x-large; color: red;">${result.caption}</p></center>
                <center><a href="/like/${result.id}"><button style="background-color: cyan; color: black; height: 40px; width: 90px; font-size: larger">Like</button></a> &nbsp${result.likes}&nbsp<br><br>
                <a href="/comment/${result.id}"><button style="background-color: black; color: white; height: 40px; width: 110px; font-size: larger;">comment</button></a></center><br>
                <center><a href="/allcomments/${result.id}"><button style="background-color: black; color: white; height: 40px; width: 200px; font-size: larger;">Show All comment</button></a></center><br>                        
                `);


                const htmlContent = imageTags.join('');

                res.send(htmlContent);
            } else {
                res.status(404).send('No images found');
            }
        }
    });
});


app.get('/like/:postId', (req, res) => {

    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;
    var postId = req.params.postId;

    // Check if the user has already liked the post
    const sql = "SELECT * FROM likes WHERE post_id = ? AND user_id = ?";
    connection.query(sql, [req.params.postId, userId], (err, result) => {
        console.log(sql);
        console.log(result);
        if (err) {
            console.error(err);
            return res.status(500).send("Error liking post: ", err);
        } else {

            if (result.length > 0) {
                const del = "DELETE FROM likes WHERE post_id = ? AND user_id = ?";
                connection.query(del, [req.params.postId, userId], (err, result) => {
                    if (err) {
                        console.error("Error disliking post : ", err);
                    }
                    else {
                        const dis = "UPDATE posts SET likes = likes - 1 WHERE id = ?";
                        connection.query(dis, [req.params.postId], (err, result) => {
                            if (err) throw err;
                            else {
                                console.log("Disliked Successfully");
                            }
                        });
                        res.redirect("/allphotos");
                    }
                });
            } else {
                const q1 = "UPDATE posts SET likes = likes + 1 WHERE id = ?";
                const q2 = "INSERT INTO likes (post_id, user_id) VALUES (?, ?)";

                postId = Number.parseInt(postId);
                connection.query(q1, [req.params.postId], (err, res) => {
                    if (err) {
                        console.error("Error updating likes count:", err);
                        return res.status(500).send("Error liking post: ", err);
                    }
                    postId = Number.parseInt(req.params.postId);
                    connection.query(q2, [req.params.postId, userId], (err, res) => {
                        if (err) {
                            console.error("Error inserting like:", err);
                            return res.status(500).send("Error liking post: ", err);
                        }
                        console.log("Liked Successfully");
                    });

                });
                res.redirect("/allphotos");
            }
        }
    });
});

app.get('/comment/:postId', (req, res) => {
    res.sendFile(__dirname + "/addcomments.html")
});


app.post('/comment/:postId', (req, res) => {

    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;
    var postId = req.params.postId;
    const { content } = req.body;


    console.log(req.body.content);


    const sql = "INSERT INTO comments (post_id,user_id,content) VALUES (?,?,?)";
    connection.query(sql, [req.params.postId, userId, content], (err, results) => {
        if (err) {
            console.error(err);
        }
        else {
            res.redirect("/comment/:postId");
            console.log("Comment Done Successfully");
        }
    });
});

app.get("/allcomments/:postId", (req, res) => {
    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;
    var postId = req.params.postId;

    const sql = 'SELECT content FROM comments WHERE post_id = ?';
    connection.query(sql, [req.params.postId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error fetching images');
        } else {
            if (results.length > 0) {


                const commentTags = results.map(result => `
                
                <center><p style="color:black;font-size: x-large;">${result.content}</p></center><br>                              
                `);
                const htmlContent = commentTags.join('');

                res.send(htmlContent);
            } else {
                res.status(404).send('No comments found');
            }
        }
    });

});


app.get('/chat', verifyToken, (req, res) => {
    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const userId = payload.id;
    // console.log("Payload : ",payload);
    const sql = 'SELECT id,first_name, last_name, username FROM users';

    connection.query(sql, (err, results) => {
        if (err) {
            res.status(500).json({ error: 'Failed to fetch users' });
        } else {
            if (results.length > 0) {

                const userTags = results.map(result => `
                <a href="/chat/${result.id}" style="text-decoration: none; color: black;")>
                <form action = "/chat/${result.id}" style="background-color: #9FE2BF; border: 2px solid black; border-radius: 5px">
                <p style="margin-left: 20px;" >Name: ${result.first_name} ${result.last_name}</p>
                <p style="margin-left: 20px;">Username: ${result.username}</p>
                <button type="submit" style="height: 40; width: 80; font-size: larger; color: white; background-color: black; pointer: cursor; margin-left: 20px; margin-bottom: 10px; ">Chat</button>        
                </form>
                </a>
                <hr>  
                `);
                // console.log(receiverId);
                const htmlContent = userTags.join('');

                res.send(htmlContent);
            } else {
                res.status(404).send('No users found');
            }
        }
        // onclick="sendMessage(${result.user_id})
    });
});

app.get("/chat/:userId", (req, res) => {
    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const senderId = payload.id;
    const { userId } = req.params;

    console.log("receiver id = ", userId);
    console.log("Sender Id = ", senderId);

    const getMessageQuery = 'SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)';
    connection.query(getMessageQuery, [senderId, userId, userId, senderId], (err, messages) => {
        if (err) {
            console.error('Error retrieving messages:', err);
            return res.status(500).json({ error: 'Error retrieving messages' });
        }

        const msgTags = messages.map(result => `
        <div style="background-color: #B5BBBB;">
            <p style="font-size: 12px; color: black;">${result.timestamp}</p>
            <p style="color: black;">${result.message}</p>
            <hr>      
            </div>
        `);
        const htmlContent = msgTags.join('');

        res.write(htmlContent);

        res.write(`
            <form action="/sendMessage/${senderId}/${userId}" method="POST">
                <input type="text" id="content" name="message" style="height: 60px; width: 400px;">
                <button type="submit" style="color: black; backgroundColor: white; border: 2px solid black; border-radius: 5px; height: 60px; width: 150px; font-size: larger;">send message</button>    
            </form>
            <script>
            window.onload = function() {
                window.scrollTo(0, document.body.scrollHeight);
            }
            </script>
        `);
        res.end();
    });
});


// app.post("/chat/:userId",(req,res)=>{
//     const token = req.session.token;
//     const payload = jwt.verify(token, 'Do_not_disturb');
//     const senderId = payload.id;
//     const { userId } = req.params;

//     const {message} = req.body;

//     const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

//      const insertMessageQuery = `INSERT INTO messages (sender_id, receiver_id, message, timestamp) VALUES (?, ?, ?, ?)`;
//     connection.query(insertMessageQuery, [senderId, userId, message, timestamp], (error) => {
//         if (error) {
//             console.error("Error inserting message:", error);
//             return res.status(500).json("Internal Server Error");
//         }

//         io.emit('new_message', { senderId, userId, message, timestamp });
//         // res.status(200).json("Message sent successfully");
//         res.redirect("/allMessages/:userId");
//     });
// })

app.post("/sendMessage/:senderId/:userId", (req, res) => {

    const token = req.session.token;
    const payload = jwt.verify(token, 'Do_not_disturb');
    const senderId = payload.id;
    const { userId } = req.params;

    console.log("receiver id = ", userId);
    console.log("Sender Id = ", senderId);

    const message = req.body.message;
    console.log('msg :', message);

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    console.log('rec : ', userId);
    console.log('msg :', message);

    var UserId = Number.parseInt(userId);

    const insertMessageQuery = `INSERT INTO messages (sender_id, receiver_id, message, timestamp) VALUES (?, ?, ?, ?)`;
    connection.query(insertMessageQuery, [senderId, userId, message, timestamp], (error) => {
        if (error) {
            console.error("Error inserting message:", error);
            return res.status(500).json("Internal Server Error");
        }

        io.emit('new_message', { senderId, userId, message, timestamp });
        console.log("This is a ", userId, UserId);
        res.status(200).json("Message sent successfully");
        // res.redirect("/chat/:userId")
    });
})

// app.get("/allMessages/:userId",(req,res)=>{
//     const token = req.session.token;
//     const payload = jwt.verify(token, 'Do_not_disturb');
//     const senderId = payload.id;
//     const { userId } = req.params;

//     const sql = 'SELECT message, timestamp FROM messages WHERE sender_id = ? AND receiver_Id = ?';
//     connection.query(sql, [senderId,userId], (err, results) => {
//         if (err) {
//             console.error(err);
//             res.status(500).send('Error fetching messages');
//         } else {
//             if (results.length > 0) {
//                 const msgTags = results.map(result => `
//                 <p>${result.timestamp}</p>
//                 <center><p style="color:black;font-size: x-large;">${result.message}</p></center><br>                              
//                 `);
//                 const htmlContent = msgTags.join('');

//                 res.send(htmlContent);
//             } else {
//                 res.status(404).send('No Messages found');
//             }
//         }
//     });

// })

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle new message from client
    socket.on('message', (data) => {
        const { sender, receiver, message } = data;
        const timestamp = new Date().toISOString;

        // Save message to database
        const newMessage = { sender, receiver, message, timestamp };
        connection.query('INSERT INTO messages SET ?', newMessage, (err, result) => {
            if (err) throw err;
            console.log('Message saved to database');
        });

        // Emit message to sender and receiver
        io.emit('message', { sender, receiver, message, timestamp });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});


app.listen(4000);
