// Quick test script to check UCC student search API
const API_URL = 'http://localhost:5000/api/ucc/students';

async function testSearch(searchValue) {
  try {
    console.log(`\n🔍 Testing search with: "${searchValue}"`);
    
    const response = await fetch(`${API_URL}?search=${encodeURIComponent(searchValue)}`);
    const data = await response.json();
    
    console.log('✅ Response:', data);
    
    if (data.success && data.students && data.students.length > 0) {
      console.log(`📊 Found ${data.students.length} student(s):`);
      data.students.slice(0, 3).forEach(s => {
        console.log(`   - ${s.name} | Roll: ${s.roll} | ID: ${s.studentId} | Phone: ${s.phone}`);
      });
    } else {
      console.log('❌ No students found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test different search methods
(async () => {
  console.log('='.repeat(60));
  console.log('UCC STUDENT SEARCH API TEST');
  console.log('='.repeat(60));
  
  // Test 1: Get all students (no search)
  await testSearch('');
  
  // Test 2: Search by roll (example)
  await testSearch('001');
  
  // Test 3: Search by phone pattern
  await testSearch('017');
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed! Check the results above.');
  console.log('='.repeat(60));
})();
