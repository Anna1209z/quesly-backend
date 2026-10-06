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

// Схема відповіді
const answerSchema = new mongoose.Schema({
  user: { type: String, default: 'anonymous_user' },
  text: { type: String, required: true },
  likes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const Answer = mongoose.model('Answer', answerSchema);

// ЕНДПОІНТИ (API)

// 1. Отримати всі відповіді у стрічку (сортуємо від найновіших)
app.get('/api/answers', async (req, res) => {
  try {
    const answers = await Answer.find().sort({ createdAt: -1 });
    res.json(answers);
  } catch (error) {
    res.status(500).json({ message: 'Помилка отримання даних' });
  }
});

// 2. Надіслати нову відповідь на питання дня
app.post('/api/answers', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!text) return res.status(400).json({ message: 'Текст не може бути пустим' });

    const newAnswer = new Answer({ user, text });
    await newAnswer.save();
    res.status(201).json(newAnswer);
  } catch (error) {
    res.status(500).json({ message: 'Помилка збереження відповіді' });
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