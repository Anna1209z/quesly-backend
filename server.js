const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ База даних MongoDB підключена!'))
  .catch((err) => console.error('❌ Помилка підключення до MongoDB:', err));


const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  category: { type: String, default: 'General' },
});

// Схема відповіді
const answerSchema = new mongoose.Schema({
  user: { type: String, default: 'anonymous_user' },
  text: { type: String, required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  likes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const Question = mongoose.model('Question', questionSchema);
const Answer = mongoose.model('Answer', answerSchema);

// ЕНДПОІНТИ (API)

app.get('/api/questions/random', async (req, res) => {
  try {
    const { exclude } = req.query; // Отримуємо ID питання, яке треба пропустити
    
    let query = {};
    if (exclude) {
      query._id = { $ne: exclude }; // $ne = not equal (не дорівнює)
    }

    const count = await Question.countDocuments(query);
    if (count === 0) {
      // Якщо інших питань немає або база порожня, шукаємо будь-яке
      const fallback = await Question.findOne();
      return res.json(fallback || { text: "IF YOU ONLY HAD ONE DAY OFF, WHAT WOULD YOU DO?" });
    }

    const random = Math.floor(Math.random() * count);
    const question = await Question.findOne(query).skip(random);
    res.json(question);
  } catch (error) {
    res.status(500).json({ message: 'Помилка отримання питання' });
  }
});

// 2. Додати початковий масив питань (для наповнення бази)
app.get('/api/questions/seed', async (req, res) => {
  try {
    const defaultQuestions = [
      { text: "IF YOU ONLY HAD ONE DAY OFF, WHAT WOULD YOU DO?" },
      { text: "WHAT IS A MOVIE YOU CAN WATCH OVER AND OVER AGAIN?" },
      { text: "IF YOU COULD HAVE DINNER WITH ANY HISTORICAL FIGURE, WHO WOULD IT BE?" },
      { text: "WHAT IS THE BEST ADVICE YOU HAVE EVER RECEIVED?" },
      { text: "IF YOU COULD INSTANTLY BECOME AN EXPERT IN SOMETHING, WHAT WOULD IT BE?" },
    ];
    await Question.deleteMany({}); // Очищаємо старі для уникнення дублікатів
    const inserted = await Question.insertMany(defaultQuestions);
    res.json({ message: 'Питання успішно додано у базу!', count: inserted.length });
  } catch (error) {
    res.status(500).json({ message: 'Помилка заповнення питань' });
  }
});


app.get('/api/answers', async (req, res) => {
  try {
    const { questionId } = req.query;
    let query = {};

    // Якщо передано ID питання — перетворюємо його на суворий ObjectId для MongoDB
    if (questionId && mongoose.Types.ObjectId.isValid(questionId)) {
      query.questionId = new mongoose.Types.ObjectId(questionId);
    }

    const answers = await Answer.find(query)
      .populate('questionId', 'text')
      .sort({ createdAt: -1 });

    res.json(answers);
  } catch (error) {
    console.error('Помилка сервера:', error);
    res.status(500).json({ message: 'Помилка завантаження відповідей' });
  }
});

// 2. Надіслати нову відповідь на питання дня
app.post('/api/answers', async (req, res) => {
  try {
    const { user, text, questionId } = req.body;

    console.log('--- POST /api/answers ---');
    console.log('Отриманий questionId:', questionId);

    if (!text) {
      return res.status(400).json({ message: 'Текст порожній' });
    }

    // Перевіряємо та явно конвертуємо questionId
    let validQId = null;
    if (questionId && mongoose.Types.ObjectId.isValid(questionId)) {
      validQId = new mongoose.Types.ObjectId(questionId);
    }

    const newAnswer = new Answer({
      user: user || 'anonymous_user',
      text,
      questionId: validQId
    });

    const savedAnswer = await newAnswer.save();
    console.log('Збережена відповідь:', savedAnswer);

    res.json(savedAnswer);
  } catch (error) {
    console.error('Помилка створення відповіді:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// 3. Поставити лайк відповіді
app.post('/api/answers/:id/like', async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ message: 'Відповідь не знайдена' });

    answer.likes += 1;
    await answer.save();
    res.json(answer);
  } catch (error) {
    res.status(500).json({ message: 'Помилка оновлення лайка' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Сервер запущено на порту ${PORT}`);
});