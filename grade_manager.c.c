#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_STUDENTS 50
#define NAME_LEN 50

typedef struct {
    int id;
    char name[NAME_LEN];
    float grade;
} Student;

Student students[MAX_STUDENTS];
int studentCount = 0;

// Function prototypes
void addStudent();
void displayAll();
void calculateAverage();
void findTopStudent();
void saveToFile();
void loadFromFile();
void menu();

int main() {
    loadFromFile();
    int choice;
    
    do {
        menu();
        printf("Enter your choice: ");
        scanf("%d", &choice);
        
        switch(choice) {
            case 1: addStudent(); break;
            case 2: displayAll(); break;
            case 3: calculateAverage(); break;
            case 4: findTopStudent(); break;
            case 5: saveToFile(); break;
            case 0: printf("Goodbye!\n"); break;
            default: printf("Invalid choice!\n");
        }
    } while(choice != 0);
    
    return 0;
}

void menu() {
    printf("\n=== Student Grade Manager ===\n");
    printf("1. Add Student\n");
    printf("2. Display All Students\n");
    printf("3. Calculate Average Grade\n");
    printf("4. Find Top Student\n");
    printf("5. Save & Exit\n");
    printf("0. Exit without saving\n");
}

void addStudent() {
    if (studentCount >= MAX_STUDENTS) {
        printf("Maximum students reached!\n");
        return;
    }
    
    Student s;
    printf("Enter ID: ");
    scanf("%d", &s.id);
    printf("Enter Name: ");
    scanf(" %[^\n]", s.name);  // Read string with spaces
    printf("Enter Grade (0-100): ");
    scanf("%f", &s.grade);
    
    students[studentCount++] = s;
    printf("Student added successfully!\n");
}

void displayAll() {
    if (studentCount == 0) {
        printf("No students found!\n");
        return;
    }
    
    printf("\nID\tName\t\tGrade\n");
    printf("--------------------------------\n");
    for (int i = 0; i < studentCount; i++) {
        printf("%d\t%-15s\t%.2f\n", 
               students[i].id, 
               students[i].name, 
               students[i].grade);
    }
}

void calculateAverage() {
    if (studentCount == 0) {
        printf("No students to calculate!\n");
        return;
    }
    
    float sum = 0;
    for (int i = 0; i < studentCount; i++) {
        sum += students[i].grade;
    }
    printf("Average Grade: %.2f\n", sum / studentCount);
}

void findTopStudent() {
    if (studentCount == 0) {
        printf("No students!\n");
        return;
    }
    
    int topIndex = 0;
    for (int i = 1; i < studentCount; i++) {
        if (students[i].grade > students[topIndex].grade) {
            topIndex = i;
        }
    }
    
    printf("Top Student:\n");
    printf("Name: %s, ID: %d, Grade: %.2f\n", 
           students[topIndex].name, 
           students[topIndex].id, 
           students[topIndex].grade);
}

void saveToFile() {
    FILE *file = fopen("students.dat", "wb");
    if (file == NULL) {
        printf("Error saving file!\n");
        return;
    }
    
    fwrite(&studentCount, sizeof(int), 1, file);
    fwrite(students, sizeof(Student), studentCount, file);
    fclose(file);
    printf("Data saved successfully!\n");
}

void loadFromFile() {
    FILE *file = fopen("students.dat", "rb");
    if (file == NULL) {
        return;  // First run, no file exists
    }
    
    fread(&studentCount, sizeof(int), 1, file);
    fread(students, sizeof(Student), studentCount, file);
    fclose(file);
}