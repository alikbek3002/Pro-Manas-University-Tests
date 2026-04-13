require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const mappings = [
  {
    filePath: '/tmp/biology_images/image1.png',
    qTextLike: '%Энеликтин түзүлүшүнүн схемасынан%'
  },
  {
    filePath: '/tmp/biology_images/image2.png',
    qTextLike: '%Схемада козу карын денесинин органоиддери берилген%'
  },
  {
    filePath: '/tmp/biology_images/image3.png',
    qTextLike: '%Схемада калпактуу козу карын берилген%'
  }
];

async function run() {
  for (let i = 0; i < mappings.length; i++) {
    const { filePath, qTextLike } = mappings[i];
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    
    const fileName = `biology_q${i+1}_${Date.now()}.png`;
    const fileBuffer = fs.readFileSync(filePath);
    
    console.log(`Uploading ${fileName}...`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: false
      });
      
    if (uploadError) {
      console.error('Upload Error:', uploadError);
      continue;
    }

    const { data: publicUrlData } = supabase.storage
      .from('question-images')
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    console.log(`Uploaded to ${publicUrl}`);
    
    console.log(`Updating question matching: ${qTextLike}`);
    const { data: updateData, error: updateError } = await supabase
      .from('uni_questions_biology')
      .update({ image_url: publicUrl })
      .like('question_text', qTextLike)
      .select();
      
    if (updateError) {
      console.error('Update Error:', updateError);
    } else {
      console.log(`Updated ${updateData.length} records.`);
    }
  }
  console.log('Finished uploading biology images.');
}

run();
