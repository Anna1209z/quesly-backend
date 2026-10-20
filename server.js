const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'quesly_super_secret_key_123';

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ База даних MongoDB підключена!'))
  .catch((err) => console.error('❌ Помилка підключення до MongoDB:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

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

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Answer = mongoose.model('Answer', answerSchema);

// ЕНДПОІНТИ (API)

// 1. Реєстрація користувача
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Заповніть усі обов\'язкові поля' });
    }

    // Перевірка наявності користувача
    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Користувач з таким email або нікнеймом вже існує' });
    }

    // Хешування пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword
    });

    await newUser.save();

    // Генерація JWT
    const token = jwt.sign({ userId: newUser._id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: newUser._id, username: newUser.username, email: newUser.email, bio: newUser.bio }
    });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    res.status(500).json({ message: 'Помилка сервера при реєстрації' });
  }
});

// 2. Вхід (Login)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Введіть email та пароль' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Невірний email або пароль' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Невірний email або пароль' });
    }

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, bio: user.bio }
    });
  } catch (error) {
    console.error('Помилка входу:', error);
    res.status(500).json({ message: 'Помилка сервера при вході' });
  }
});

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