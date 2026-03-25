curl -X POST http://localhost:3000/posts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImF1dGhvckBleGFtcGxlLmNvbSIsInN1YiI6IjgzNTAzM2Q1LWFkOGMtNDE1Ny1hNTg0LWViMDM2YzM3ZDM3NSIsInJvbGUiOiJBVVRIT1IiLCJpYXQiOjE3NzQ0NjU2NTAsImV4cCI6MTc3NDU1MjA1MH0.N4FlrYZFWdQiMhb852XsTyRndEGix55cBtvK-_Dy6hA" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Secured Post",
    "content": "This content is protected by JWT Auth and Role Guards.",
    "authorId": "835033d5-ad8c-4157-a584-eb036c37d375"
  }'

