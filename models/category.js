import mongoose from "mongoose";

const categorySchema = new mongoose.Schema();

categorySchema.add({
    title: {
        type: String,
        required: true,
    },
    categoryId: {
        type: Number,
        required: true
    },
    subCategories: {
        type: [categorySchema]
    }
});

const Category = mongoose.model('Category', categorySchema);

export default Category;
