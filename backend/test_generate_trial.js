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

        // Generate TRIAL test for round 1
        const gen = await post('/api/tests/generate', { type: 'TRIAL', round: 1 }, token);

        if (gen.questions) {
            console.log('Total questions:', gen.questions.length);
            const withImage = gen.questions.filter(q => q.imageUrl && q.imageUrl.length > 0);
            console.log('Questions with image:', withImage.length);
            if (withImage.length > 0) {
                console.log('Question with image sample:', JSON.stringify(withImage[0], null, 2));
            }
        } else {
            console.log('Error:', gen);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
