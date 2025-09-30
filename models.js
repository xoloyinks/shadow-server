const mongoose = require('mongoose');

const ShadowSchema = new mongoose.Schema({
    shadow: String,
    pass: String,
    createdAt: { type: Date, default: Date.now, expires: 86400}
});

const ChatSchema = new mongoose.Schema({
    sender: String,
    shadowId: String,
    message: String,
    messageType: String,
    timestamp: String,
    // optional reply object
    reply: {
        sender: String,
        message: String
    }
});

const ImageCaptionSchema = new mongoose.Schema({
    image: String,
    caption: String,
    shadowId: String
});

const Shadow = mongoose.model('Shadow', ShadowSchema);
const Chat = mongoose.model('Chat', ChatSchema);
const ImageCaption = mongoose.model('ImageCaption', ImageCaptionSchema);

module.exports = { Shadow, Chat, ImageCaption };