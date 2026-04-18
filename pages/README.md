Student Grade Manager
A simple yet practical C program that manages student records, grades, and performs basic analytics. Perfect for beginners learning C programming concepts.

Features
➕ Add new students (ID, name, grade)

📋 Display all student records

📊 Calculate average grade of the class

🏆 Find the top-performing student

💾 Save data to file and load automatically on startup

🗂️ Persistent storage using binary files

Technologies Used
Language: C (C99 standard)

File I/O: Binary file operations for data persistence

Data Structure: Struct with arrays

How to Compile and Run
Linux / macOS
bash
gcc grade_manager.c -o grade_manager
./grade_manager
Windows (with GCC)
bash
gcc grade_manager.c -o grade_manager.exe
grade_manager.exe
Usage Example
text
=== Student Grade Manager ===
1. Add Student
2. Display All Students
3. Calculate Average Grade
4. Find Top Student
5. Save & Exit
0. Exit without saving

Enter your choice: 1
Enter ID: 101
Enter Name: John Doe
Enter Grade (0-100): 87.5
Student added successfully!
Project Structure
text
grade_manager.c    # Main source code
students.dat       # Binary data file (auto-generated)
Key Concepts Covered
struct for organizing student data

Arrays of structures

File operations (fopen, fwrite, fread)

Modular programming with functions

Basic input handling

Future Improvements
Delete student by ID

Search student by name or ID

Sort students by grade or name

Grade classification (A, B, C, D, F)

Generate pass/fail reports

Edit existing student records

Author
[Your Name]

License
MIT License - feel free to use, modify, and distribute.