import mongoose from "mongoose";

const topicSchema = new mongoose.Schema({
    title: String,
    description: String,
    addedDate: String,
    authorName: String,
    magnetLink: String,
    torrentLink: String,
    lastThanked: [{
        name: String,
        thankedDate: String
    }]
});

const Topic = mongoose.model('Topic', topicSchema);

export default Topic;
