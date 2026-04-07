const http = require('http');

function post(path, body, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 5050,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };

        const req = http.request(options, (res) => {
            let result = '';
            res.on('data', (d) => result += d);
            res.on('end', () => resolve(JSON.parse(result)));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function run() {
    try {
        const login = await post('/api/tests/login', { username: 'studenttest', password: 'akyl977' });
        const token = login.token;
        console.log('Token received');

        const gen = await post('/api/tests/generate', { type: 'MAIN', subject: 'history', grade: 5 }, token);

        if (gen.questions) {
            console.log('JSON Questions Sample:', JSON.stringify(gen.questions.slice(0, 5), null, 2));
        } else {
            console.log('Error or no questions:', gen);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
