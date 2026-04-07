const fetch = require('node-fetch');

async function test() {
    const loginRes = await fetch('http://localhost:5050/api/tests/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'studenttest', password: 'akyl977' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Logged in, token received');

    const genRes = await fetch('http://localhost:5050/api/tests/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'MAIN', subject: 'history', grade: 5 })
    });
    const genData = await genRes.json();

    if (genData.questions && genData.questions.length > 0) {
        const q = genData.questions.find(x => x.imageUrl !== '');
        console.log('Sample question with image:', JSON.stringify(q || genData.questions[0], null, 2));
    } else {
        console.log('No questions returned or empty array:', genData);
    }
}
test();
