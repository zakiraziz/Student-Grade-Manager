from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel

from app.database import get_db
from app import models, auth
from app.models import TaskStatus, TaskPriority

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

class AnalyticsResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    todo_tasks: int
    overdue_tasks: int
    completion_rate: float
    average_completion_time: float
    tasks_by_priority: List[dict]
    tasks_by_status: List[dict]
    weekly_productivity: List[dict]
    project_distribution: List[dict]

class DateRangeParams:
    def __init__(
        self,
        start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
        end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    ):
        self.start_date = datetime.strptime(start_date, "%Y-%m-%d") if start_date else datetime.now() - timedelta(days=30)
        self.end_date = datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.now()

@router.get("/dashboard", response_model=AnalyticsResponse)
async def get_analytics(
    date_range: DateRangeParams = Depends(),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Get analytics data for dashboard"""
    
    # Base query for user's tasks
    query = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.created_at >= date_range.start_date,
        models.Task.created_at <= date_range.end_date
    )
    
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    
    tasks = query.all()
    
    # Calculate statistics
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == TaskStatus.COMPLETED)
    in_progress_tasks = sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS)
    todo_tasks = sum(1 for t in tasks if t.status == TaskStatus.TODO)
    overdue_tasks = sum(1 for t in tasks if t.status == TaskStatus.OVERDUE)
    
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    # Calculate average completion time
    completed = [t for t in tasks if t.status == TaskStatus.COMPLETED and t.completed_at]
    if completed:
        avg_time = sum((t.completed_at - t.created_at).total_seconds() / 3600 for t in completed) / len(completed)
    else:
        avg_time = 0
    
    # Tasks by priority
    priority_counts = {}
    for priority in TaskPriority:
        priority_counts[priority.value] = sum(1 for t in tasks if t.priority == priority)
    
    tasks_by_priority = [
        {"name": name.capitalize(), "value": count}
        for name, count in priority_counts.items()
    ]
    
    # Tasks by status
    status_counts = {
        "Completed": completed_tasks,
        "In Progress": in_progress_tasks,
        "Todo": todo_tasks,
        "Overdue": overdue_tasks,
    }
    tasks_by_status = [
        {"name": name, "value": count}
        for name, count in status_counts.items()
    ]
    
    # Weekly productivity
    weekly_productivity = []
    for i in range(7):
        day = datetime.now() - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0)
        day_end = day.replace(hour=23, minute=59, second=59)
        
        day_tasks = [t for t in tasks if day_start <= t.created_at <= day_end]
        weekly_productivity.append({
            "day": day.strftime("%a"),
            "completed": sum(1 for t in day_tasks if t.status == TaskStatus.COMPLETED),
            "created": len(day_tasks),
        })
    
    weekly_productivity.reverse()
    
    # Project distribution
    project_tasks = db.query(
        models.Project.id,
        models.Project.name,
        func.count(models.Task.id).label("total"),
        func.sum(
            func.case([(models.Task.status == TaskStatus.COMPLETED, 1)], else_=0)
        ).label("completed")
    ).join(
        models.Task, models.Task.project_id == models.Project.id, isouter=True
    ).filter(
        models.Project.owner_id == current_user.id
    ).group_by(
        models.Project.id, models.Project.name
    ).all()
    
    project_distribution = [
        {
            "name": p.name,
            "tasks": p.total or 0,
            "completed": p.completed or 0,
        }
        for p in project_tasks
    ]
    
    return AnalyticsResponse(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        todo_tasks=todo_tasks,
        overdue_tasks=overdue_tasks,
        completion_rate=completion_rate,
        average_completion_time=avg_time,
        tasks_by_priority=tasks_by_priority,
        tasks_by_status=tasks_by_status,
        weekly_productivity=weekly_productivity,
        project_distribution=project_distribution,
    )

@router.get("/export")
async def export_analytics(
    format: str = Query("json", regex="^(json|csv|pdf)$"),
    date_range: DateRangeParams = Depends(),
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Export analytics data in various formats"""
    # Implementation for exporting data
    pass