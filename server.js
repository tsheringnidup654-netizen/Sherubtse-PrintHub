require('dotenv').config();
const app = require('./app');
const scheduler = require('./utils/scheduler');

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Sherubtse PrintHub running at http://localhost:${PORT}`);
  scheduler.start();
});
