const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const connectDb = require('./mongo');
const cron = require('node-cron');
const { Shadow, Chat, ImageCaption, Reaction } = require('./models');

// Schedule a cron job to run every 5 minutes to clean up expired shadows and their chats
cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    const expiredShadows = await Shadow.find({ createdAt: { $lte: new Date(now.getTime() - 86400000) } });
    for(const room of expiredShadows) {
        await Chat.deleteMany({ shadowId: room.shadow });
        await Shadow.deleteOne({ shadow: room.shadow });
    }
});

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

app.get('/activateServer', (req, res) => res.send("Server is active"));

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
        socket.to(data).emit('joined', 'Another lurker has entered the dark...');
        socket.to(data).emit('population', `${clientsInRoom?.size ?? 1} active`);

        const prevChats = await Chat.find({ shadowId: data });
        const prevImageCaptions = await ImageCaption.find({ shadowId: data });
        const prevReactions = await Reaction.find({ shadowId: data });

        io.to(socket.id).emit('prevMessages', prevChats);
        io.to(socket.id).emit('prevImageCaptions', prevImageCaptions);
        if(prevReactions){
            io.to(socket.id).emit('prevReactions', prevReactions);
        }
        
    });

    socket.on('text', async ({ message, rooms, user, time, messageType, reply }) => {
        const createChat = await Chat.create({
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
        io.to(rooms).emit('chat', { message, sender: user, timestamp: time, messageType, shadowId: rooms, _id: createChat.id,  reply: reply ? {
            sender: reply.sender,
            message: reply.message
        } : null });
    });

    

    socket.on('reaction', async ({ reaction, chatId, rooms }) => {
        console.log({ reaction, chatId, rooms });
        let chatReaction = await Reaction.findOne({ chatId });

        if (chatReaction) {
            // Check if this reactor has already reacted
            const existing = chatReaction.reactions.find(r => r.reactor === reaction.reactor);
            if (existing) {
                // Update the reaction for this reactor
                existing.reaction = reaction.reaction;
            } else {
                // Add new reaction for this reactor
                chatReaction.reactions.push({ reaction: reaction.reaction, reactor: reaction.reactor });
            }
            await chatReaction.save();
        } else {
            // Create new Reaction document
            await Reaction.create({ chatId, reactions: [{ reaction: reaction.reaction, reactor: reaction.reactor }], shadowId: rooms });
        }
        const prevReactions = await Reaction.find({ shadowId: rooms });
        io.to(rooms).emit('prevReactions', prevReactions);
    });

    socket.on('deleteChat', async({ chatId, rooms }) => {
        if(!chatId) return;
        await Chat.deleteOne({ _id: chatId });
        await Reaction.deleteMany({ chatId });
        const prevChats = await Chat.find({ shadowId: rooms });
        io.to(rooms).emit('prevMessages', prevChats);
    })

    socket.on('typing', ({rooms}) => {
        socket.to(rooms).emit('typing', "Something is lurking...");
    })
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
})