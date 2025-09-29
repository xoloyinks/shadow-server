const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const connectDb = require('./mongo');

// Import mongoose models
const { Shadow, Chat, ImageCaption } = require('./models');

dotenv.config();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "_" + Math.floor(Math.random() * 100) + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cors());

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

app.get('/', (req, res) => res.send("Ondo State!"));

// Validate Shadow Identity
app.get('/validateId', async (req, res) => {
    const shadowId = req.query.query;
    const shadow = await Shadow.findOne({ shadow: shadowId });
    res.send(!shadow);
});

app.post('/createShadow', async (req, res) => {
    const form = req.body;
    try {
        await Shadow.create({ shadow: form.shadowId, pass: form.shadowPass });
        res.send(true);
    } catch (err) {
        res.send(false);
    }
});

app.get('/checkId', async (req, res) => {
    const data = req.query.id;
    const shadow = await Shadow.findOne({ shadow: data });
    res.send(!!shadow);
});

app.get('/validatePass', async (req, res) => {
    const dataId = req.query.id;
    const dataPass = req.query.pass;
    const shadow = await Shadow.findOne({ shadow: dataId });
    res.send(shadow && shadow.pass === dataPass);
});

io.on('connection', (socket) => {
    socket.on('roomId', async (data) => {
        socket.join(data);
        const clientsInRoom = io.sockets.adapter.rooms.get(data);
        socket.to(data).emit('joined', 'Somebody joined');
        socket.to(data).emit('population', `${clientsInRoom?.size ?? 1} active`);

        const prevChats = await Chat.find({ shadowId: data });
        const prevImageCaptions = await ImageCaption.find({ shadowId: data });

        io.to(socket.id).emit('prevMessages', prevChats);
        io.to(socket.id).emit('prevImageCaptions', prevImageCaptions);
    });

    socket.on('text', async ({ message, rooms, user, time, messageType, reply }) => {
        await Chat.create({
            sender: user,
            shadowId: rooms,
            message,
            messageType,
            timestamp: time,
            reply: reply ? {
                sender: reply.sender,
                message: reply.message
            } : null
        });
        io.to(rooms).emit('chat', { message, user, time, messageType});
    });

    socket.on('image', async ({ message, rooms, user, time, messageType }) => {
        await Chat.create({
            sender: user,
            shadowId: rooms,
            message,
            messageType,
            timestamp: time
        });
        io.to(rooms).emit('chat', { message, user, time, messageType });
    });

    socket.on('image_caption', async ({ image, caption, rooms }) => {
        await ImageCaption.create({
            image,
            caption,
            shadowId: rooms
        });
        io.to(rooms).emit('imageData', { image, caption });
    });
});

app.post('/uploadedImage', upload.single('file'), (req, res) => {
    res.send(req.file?.filename);
});

app.get('/fetchCaption', async (req, res) => {
    const data = req.query.image;
    const result = await ImageCaption.findOne({ image: data });
    if (result) {
        res.send(result);
    }
});

app.post('/chatData', (req, res) => {
    console.log(req.body);
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    connectDb();
    console.log(`Connected to port ${PORT}`);
});