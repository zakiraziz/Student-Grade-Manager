from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc, case, text
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import pandas as pd
import json
import csv
import io
from io import StringIO, BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER
import matplotlib.pyplot as plt
import seaborn as sns
from fastapi.responses import StreamingResponse, FileResponse
import asyncio
from cachetools import TTLCache
import hashlib

from app.database import get_db
from app import models, auth
from app.models import TaskStatus, TaskPriority
from app.websocket import manager  # For real-time updates

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Cache for expensive queries
analytics_cache = TTLCache(maxsize=100, ttl=300)  # 5 minutes TTL

# Additional Pydantic models
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
    productivity_score: float = Field(..., description="Overall productivity score (0-100)")
    estimated_completion: datetime = Field(None, description="Estimated completion date for all tasks")
    tasks_by_tags: List[dict] = Field(default_factory=list)
    time_analysis: dict = Field(default_factory=dict)
    user_performance: dict = Field(default_factory=dict)
    insights: List[str] = Field(default_factory=list)

class DetailedAnalyticsResponse(AnalyticsResponse):
    hourly_activity: List[dict] = Field(default_factory=list)
    task_aging: List[dict] = Field(default_factory=list)
    completion_forecast: List[dict] = Field(default_factory=list)
    bottleneck_tasks: List[dict] = Field(default_factory=list)
    collaboration_stats: dict = Field(default_factory=dict)
    custom_reports: dict = Field(default_factory=dict)

class DateRangeParams:
    def __init__(
        self,
        start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
        end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
        compare_previous: bool = Query(False, description="Compare with previous period"),
    ):
        self.end_date = datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.now()
        self.start_date = datetime.strptime(start_date, "%Y-%m-%d") if start_date else self.end_date - timedelta(days=30)
        
        if compare_previous:
            period_days = (self.end_date - self.start_date).days
            self.previous_start_date = self.start_date - timedelta(days=period_days)
            self.previous_end_date = self.end_date - timedelta(days=period_days)
        else:
            self.previous_start_date = None
            self.previous_end_date = None

@router.get("/dashboard", response_model=AnalyticsResponse)
async def get_analytics(
    date_range: DateRangeParams = Depends(),
    project_id: Optional[int] = Query(None),
    include_subtasks: bool = Query(True),
    group_by: Optional[str] = Query(None, regex="^(day|week|month)$"),
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Get analytics data for dashboard with enhanced metrics"""
    
    # Generate cache key
    cache_key = hashlib.md5(
        f"{current_user.id}_{date_range.start_date}_{date_range.end_date}_{project_id}_{include_subtasks}".encode()
    ).hexdigest()
    
    # Check cache
    if cache_key in analytics_cache:
        return analytics_cache[cache_key]
    
    # Base query for user's tasks
    query = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.created_at >= date_range.start_date,
        models.Task.created_at <= date_range.end_date
    )
    
    if include_subtasks:
        query = query.filter(or_(
            models.Task.parent_task_id.is_(None),
            models.Task.parent_task_id.isnot(None)
        ))
    
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    
    tasks = query.all()
    
    # Get tasks from previous period for comparison
    previous_tasks = []
    if date_range.previous_start_date:
        prev_query = db.query(models.Task).filter(
            models.Task.owner_id == current_user.id,
            models.Task.created_at >= date_range.previous_start_date,
            models.Task.created_at <= date_range.previous_end_date
        )
        if project_id:
            prev_query = prev_query.filter(models.Task.project_id == project_id)
        previous_tasks = prev_query.all()
    
    # Calculate statistics
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == TaskStatus.COMPLETED)
    in_progress_tasks = sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS)
    todo_tasks = sum(1 for t in tasks if t.status == TaskStatus.TODO)
    overdue_tasks = sum(1 for t in tasks if t.status == TaskStatus.OVERDUE)
    
    completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    # Calculate average completion time in hours
    completed = [t for t in tasks if t.status == TaskStatus.COMPLETED and t.completed_at and t.created_at]
    if completed:
        avg_time = sum((t.completed_at - t.created_at).total_seconds() / 3600 for t in completed) / len(completed)
    else:
        avg_time = 0
    
    # Tasks by priority with additional metrics
    priority_counts = {}
    priority_avg_time = {}
    for priority in TaskPriority:
        priority_tasks = [t for t in tasks if t.priority == priority]
        priority_counts[priority.value] = len(priority_tasks)
        
        priority_completed = [t for t in priority_tasks if t.status == TaskStatus.COMPLETED and t.completed_at]
        if priority_completed:
            priority_avg_time[priority.value] = sum(
                (t.completed_at - t.created_at).total_seconds() / 3600 for t in priority_completed
            ) / len(priority_completed)
        else:
            priority_avg_time[priority.value] = 0
    
    tasks_by_priority = [
        {
            "name": name.capitalize(),
            "value": count,
            "avg_completion_time": round(priority_avg_time.get(name, 0), 2)
        }
        for name, count in priority_counts.items()
    ]
    
    # Enhanced tasks by status with trends
    status_counts = {
        "Completed": completed_tasks,
        "In Progress": in_progress_tasks,
        "Todo": todo_tasks,
        "Overdue": overdue_tasks,
    }
    
    # Calculate previous period stats for comparison
    prev_completed = sum(1 for t in previous_tasks if t.status == TaskStatus.COMPLETED) if previous_tasks else 0
    completion_trend = ((completed_tasks - prev_completed) / (prev_completed or 1)) * 100 if previous_tasks else 0
    
    tasks_by_status = [
        {
            "name": name,
            "value": count,
            "trend": completion_trend if name == "Completed" else 0
        }
        for name, count in status_counts.items()
    ]
    
    # Weekly productivity with enhanced metrics
    weekly_productivity = []
    for i in range(7):
        day = datetime.now() - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0)
        day_end = day.replace(hour=23, minute=59, second=59)
        
        day_tasks = [t for t in tasks if day_start <= t.created_at <= day_end]
        day_completed = [t for t in day_tasks if t.status == TaskStatus.COMPLETED]
        
        # Calculate average completion time for this day
        avg_day_completion = 0
        if day_completed:
            avg_day_completion = sum(
                (t.completed_at - t.created_at).total_seconds() / 3600 for t in day_completed
            ) / len(day_completed)
        
        weekly_productivity.append({
            "day": day.strftime("%a"),
            "date": day.strftime("%Y-%m-%d"),
            "completed": len(day_completed),
            "created": len(day_tasks),
            "avg_completion_hours": round(avg_day_completion, 2),
            "productivity_score": (len(day_completed) / (len(day_tasks) or 1)) * 100
        })
    
    weekly_productivity.reverse()
    
    # Enhanced project distribution with progress metrics
    project_stats = db.query(
        models.Project.id,
        models.Project.name,
        models.Project.color,
        func.count(models.Task.id).label("total_tasks"),
        func.sum(case((models.Task.status == TaskStatus.COMPLETED, 1), else_=0)).label("completed_tasks"),
        func.sum(case((models.Task.status == TaskStatus.OVERDUE, 1), else_=0)).label("overdue_tasks"),
        func.avg(
            case(
                (and_(models.Task.status == TaskStatus.COMPLETED, models.Task.completed_at.isnot(None)),
                 func.extract('epoch', models.Task.completed_at - models.Task.created_at)),
                else_=None
            )
        ).label("avg_completion_seconds")
    ).join(
        models.Task, models.Task.project_id == models.Project.id, isouter=True
    ).filter(
        models.Project.owner_id == current_user.id
    ).group_by(
        models.Project.id, models.Project.name, models.Project.color
    ).all()
    
    project_distribution = []
    for p in project_stats:
        progress = (p.completed_tasks / p.total_tasks * 100) if p.total_tasks > 0 else 0
        project_distribution.append({
            "id": p.id,
            "name": p.name,
            "color": p.color or "#3B82F6",
            "tasks": p.total_tasks or 0,
            "completed": p.completed_tasks or 0,
            "overdue": p.overdue_tasks or 0,
            "progress": round(progress, 1),
            "avg_completion_hours": round((p.avg_completion_seconds or 0) / 3600, 2)
        })
    
    # Calculate productivity score (0-100)
    productivity_score = calculate_productivity_score(
        completed_tasks, total_tasks, avg_time, overdue_tasks, completion_trend
    )
    
    # Tasks by tags
    tasks_with_tags = [t for t in tasks if t.tags]
    tag_counts = {}
    for task in tasks_with_tags:
        for tag in task.tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    
    tasks_by_tags = [
        {"name": tag, "count": count, "percentage": (count / total_tasks * 100) if total_tasks > 0 else 0}
        for tag, count in sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    ]
    
    # Time analysis
    time_analysis = analyze_time_patterns(tasks)
    
    # User performance metrics
    user_performance = calculate_user_performance(db, current_user.id, date_range)
    
    # Generate insights
    insights = generate_insights(
        completed_tasks, total_tasks, completion_rate, avg_time,
        overdue_tasks, productivity_score, previous_tasks
    )
    
    # Estimated completion date for all pending tasks
    estimated_completion = calculate_estimated_completion(tasks, avg_time) if avg_time > 0 else None
    
    response = AnalyticsResponse(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        todo_tasks=todo_tasks,
        overdue_tasks=overdue_tasks,
        completion_rate=round(completion_rate, 1),
        average_completion_time=round(avg_time, 2),
        tasks_by_priority=tasks_by_priority,
        tasks_by_status=tasks_by_status,
        weekly_productivity=weekly_productivity,
        project_distribution=project_distribution,
        productivity_score=round(productivity_score, 1),
        estimated_completion=estimated_completion,
        tasks_by_tags=tasks_by_tags,
        time_analysis=time_analysis,
        user_performance=user_performance,
        insights=insights
    )
    
    # Cache the response
    analytics_cache[cache_key] = response
    
    return response

@router.get("/detailed", response_model=DetailedAnalyticsResponse)
async def get_detailed_analytics(
    date_range: DateRangeParams = Depends(),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Get detailed analytics with advanced metrics"""
    
    # Get base analytics
    base_analytics = await get_analytics(date_range, project_id, True, None, db, current_user)
    
    # Get all tasks for detailed analysis
    query = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.created_at >= date_range.start_date,
        models.Task.created_at <= date_range.end_date
    )
    
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    
    tasks = query.all()
    
    # Hourly activity pattern
    hourly_activity = []
    for hour in range(24):
        hour_tasks = [t for t in tasks if t.created_at and t.created_at.hour == hour]
        hour_completed = [t for t in hour_tasks if t.status == TaskStatus.COMPLETED]
        
        hourly_activity.append({
            "hour": hour,
            "tasks_created": len(hour_tasks),
            "tasks_completed": len(hour_completed),
            "productivity": (len(hour_completed) / (len(hour_tasks) or 1)) * 100
        })
    
    # Task aging analysis (tasks that have been pending for too long)
    task_aging = []
    now = datetime.now()
    for task in tasks:
        if task.status != TaskStatus.COMPLETED:
            age_days = (now - task.created_at).days
            if age_days > 7:  # Tasks older than 7 days
                task_aging.append({
                    "id": task.id,
                    "title": task.title,
                    "age_days": age_days,
                    "priority": task.priority.value,
                    "status": task.status.value
                })
    
    task_aging.sort(key=lambda x: x["age_days"], reverse=True)
    
    # Completion forecast using linear regression
    completion_forecast = forecast_completion(tasks, date_range.start_date, date_range.end_date)
    
    # Bottleneck tasks (tasks that are blocking others)
    bottleneck_tasks = []
    for task in tasks:
        blocking_count = db.query(models.Task).filter(
            models.Task.blocked_by == task.id
        ).count()
        
        if blocking_count > 0:
            bottleneck_tasks.append({
                "id": task.id,
                "title": task.title,
                "blocking_count": blocking_count,
                "priority": task.priority.value
            })
    
    bottleneck_tasks.sort(key=lambda x: x["blocking_count"], reverse=True)
    
    # Collaboration statistics
    collaboration_stats = calculate_collaboration_stats(db, current_user.id, date_range)
    
    # Custom reports data
    custom_reports = {
        "burnout_risk": calculate_burnout_risk(tasks, hourly_activity),
        "efficiency_score": calculate_efficiency_score(tasks),
        "focus_time_percentage": calculate_focus_time(tasks),
        "estimated_completion_date": calculate_estimated_completion(tasks, base_analytics.average_completion_time)
    }
    
    return DetailedAnalyticsResponse(
        **base_analytics.dict(),
        hourly_activity=hourly_activity,
        task_aging=task_aging[:10],  # Top 10 oldest tasks
        completion_forecast=completion_forecast,
        bottleneck_tasks=bottleneck_tasks[:5],
        collaboration_stats=collaboration_stats,
        custom_reports=custom_reports
    )

@router.get("/export")
async def export_analytics(
    format: str = Query("json", regex="^(json|csv|excel|pdf)$"),
    date_range: DateRangeParams = Depends(),
    project_id: Optional[int] = Query(None),
    include_charts: bool = Query(False),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Export analytics data in various formats with enhanced options"""
    
    # Get analytics data
    analytics_data = await get_analytics(date_range, project_id, True, None, db, current_user)
    detailed_data = await get_detailed_analytics(date_range, project_id, db, current_user)
    
    if format == "json":
        # Export as JSON
        export_data = {
            "export_date": datetime.now().isoformat(),
            "user_id": current_user.id,
            "date_range": {
                "start_date": date_range.start_date.isoformat(),
                "end_date": date_range.end_date.isoformat()
            },
            "analytics": analytics_data.dict(),
            "detailed_analytics": detailed_data.dict()
        }
        
        json_str = json.dumps(export_data, indent=2, default=str)
        
        return StreamingResponse(
            io.BytesIO(json_str.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"}
        )
    
    elif format == "csv":
        # Export as CSV with multiple sheets
        output = StringIO()
        
        # Write main metrics
        writer = csv.writer(output)
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total Tasks", analytics_data.total_tasks])
        writer.writerow(["Completed Tasks", analytics_data.completed_tasks])
        writer.writerow(["Completion Rate", f"{analytics_data.completion_rate}%"])
        writer.writerow(["Productivity Score", analytics_data.productivity_score])
        writer.writerow(["Average Completion Time", f"{analytics_data.average_completion_time} hours"])
        writer.writerow([])
        
        # Write tasks by priority
        writer.writerow(["Priority", "Count", "Avg Completion Time (hours)"])
        for priority in analytics_data.tasks_by_priority:
            writer.writerow([priority["name"], priority["value"], priority.get("avg_completion_time", 0)])
        writer.writerow([])
        
        # Write weekly productivity
        writer.writerow(["Day", "Date", "Created", "Completed", "Avg Hours", "Productivity Score"])
        for week in analytics_data.weekly_productivity:
            writer.writerow([week["day"], week["date"], week["created"], week["completed"], 
                           week["avg_completion_hours"], f"{week['productivity_score']:.1f}%"])
        
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue().encode()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
    
    elif format == "excel":
        # Export as Excel with multiple sheets
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.chart import BarChart, Reference
        
        wb = openpyxl.Workbook()
        
        # Sheet 1: Overview
        ws1 = wb.active
        ws1.title = "Overview"
        
        # Style headers
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        
        overview_data = [
            ["Metric", "Value"],
            ["Total Tasks", analytics_data.total_tasks],
            ["Completed Tasks", analytics_data.completed_tasks],
            ["In Progress", analytics_data.in_progress_tasks],
            ["Todo", analytics_data.todo_tasks],
            ["Overdue", analytics_data.overdue_tasks],
            ["Completion Rate", f"{analytics_data.completion_rate}%"],
            ["Productivity Score", analytics_data.productivity_score],
            ["Average Completion Time", f"{analytics_data.average_completion_time} hours"]
        ]
        
        for row_idx, row in enumerate(overview_data, 1):
            for col_idx, value in enumerate(row, 1):
                cell = ws1.cell(row=row_idx, column=col_idx, value=value)
                if row_idx == 1:
                    cell.font = header_font
                    cell.fill = header_fill
        
        # Sheet 2: Priority Distribution
        ws2 = wb.create_sheet("Priority Distribution")
        ws2.append(["Priority", "Count", "Avg Completion Time (hours)"])
        for priority in analytics_data.tasks_by_priority:
            ws2.append([priority["name"], priority["value"], priority.get("avg_completion_time", 0)])
        
        # Create bar chart for priorities
        if analytics_data.tasks_by_priority:
            chart = BarChart()
            chart.title = "Tasks by Priority"
            data = Reference(ws2, min_col=2, min_row=1, max_row=len(analytics_data.tasks_by_priority)+1, max_col=2)
            categories = Reference(ws2, min_col=1, min_row=2, max_row=len(analytics_data.tasks_by_priority)+1)
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(categories)
            ws2.add_chart(chart, "D2")
        
        # Sheet 3: Weekly Performance
        ws3 = wb.create_sheet("Weekly Performance")
        ws3.append(["Day", "Date", "Created", "Completed", "Avg Hours", "Productivity Score"])
        for week in analytics_data.weekly_productivity:
            ws3.append([week["day"], week["date"], week["created"], week["completed"], 
                       week["avg_completion_hours"], week["productivity_score"]])
        
        # Sheet 4: Project Distribution
        ws4 = wb.create_sheet("Projects")
        ws4.append(["Project", "Tasks", "Completed", "Overdue", "Progress %", "Avg Hours"])
        for project in analytics_data.project_distribution:
            ws4.append([project["name"], project["tasks"], project["completed"], 
                       project["overdue"], project["progress"], project["avg_completion_hours"]])
        
        # Save to bytes
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"}
        )
    
    elif format == "pdf":
        # Export as PDF with charts
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(letter))
        styles = getSampleStyleSheet()
        elements = []
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#366092'),
            alignment=TA_CENTER,
            spaceAfter=30
        )
        elements.append(Paragraph("Analytics Report", title_style))
        elements.append(Spacer(1, 12))
        
        # Date range
        date_text = f"Period: {date_range.start_date.strftime('%B %d, %Y')} - {date_range.end_date.strftime('%B %d, %Y')}"
        elements.append(Paragraph(date_text, styles['Normal']))
        elements.append(Spacer(1, 20))
        
        # Summary metrics
        summary_data = [
            ['Metric', 'Value'],
            ['Total Tasks', str(analytics_data.total_tasks)],
            ['Completed Tasks', str(analytics_data.completed_tasks)],
            ['Completion Rate', f"{analytics_data.completion_rate}%"],
            ['Productivity Score', f"{analytics_data.productivity_score}"]
        ]
        
        summary_table = Table(summary_data, colWidths=[2*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 20))
        
        # Tasks by priority
        priority_data = [['Priority', 'Count']]
        for priority in analytics_data.tasks_by_priority:
            priority_data.append([priority['name'], str(priority['value'])])
        
        priority_table = Table(priority_data, colWidths=[2*inch, 2*inch])
        priority_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(Paragraph("Tasks by Priority", styles['Heading2']))
        elements.append(Spacer(1, 10))
        elements.append(priority_table)
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
        )

@router.get("/realtime")
async def get_realtime_analytics(
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Get real-time analytics for live dashboard"""
    
    # Get tasks from last 24 hours
    last_24h = datetime.now() - timedelta(hours=24)
    
    recent_tasks = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.updated_at >= last_24h
    ).all()
    
    # Real-time metrics
    realtime_data = {
        "timestamp": datetime.now().isoformat(),
        "tasks_updated_last_hour": len([t for t in recent_tasks if t.updated_at >= datetime.now() - timedelta(hours=1)]),
        "tasks_completed_today": len([t for t in recent_tasks if t.status == TaskStatus.COMPLETED and t.completed_at.date() == datetime.now().date()]),
        "active_users": get_active_users_count(db),
        "current_productivity_rate": calculate_current_productivity_rate(recent_tasks),
        "websocket_connections": len(manager.active_connections)
    }
    
    return realtime_data

@router.get("/insights")
async def get_ai_insights(
    date_range: DateRangeParams = Depends(),
    db: Session = Depends(get_db),
    current_user = Depends(auth.get_current_active_user)
):
    """Get AI-powered insights and recommendations"""
    
    analytics = await get_analytics(date_range, None, True, None, db, current_user)
    detailed = await get_detailed_analytics(date_range, None, db, current_user)
    
    insights = {
        "summary": generate_ai_summary(analytics, detailed),
        "recommendations": generate_recommendations(analytics, detailed),
        "predictions": generate_predictions(analytics, detailed),
        "risk_factors": identify_risk_factors(analytics, detailed),
        "optimization_tips": generate_optimization_tips(analytics, detailed)
    }
    
    return insights

# Helper functions

def calculate_productivity_score(completed: int, total: int, avg_time: float, overdue: int, trend: float) -> float:
    """Calculate overall productivity score"""
    completion_score = (completed / total * 50) if total > 0 else 0
    efficiency_score = max(0, 50 - (avg_time / 24 * 10)) if avg_time > 0 else 25
    overdue_penalty = max(0, 20 - (overdue * 2))
    trend_bonus = min(10, trend / 10) if trend > 0 else max(-10, trend / 10)
    
    score = completion_score + efficiency_score + overdue_penalty + trend_bonus
    return max(0, min(100, score))

def analyze_time_patterns(tasks: List) -> dict:
    """Analyze time-based patterns in task completion"""
    time_patterns = {
        "peak_hours": [],
        "most_productive_day": "",
        "average_response_time": 0,
        "procrastination_index": 0
    }
    
    if not tasks:
        return time_patterns
    
    # Find peak hours
    hour_completions = {}
    for task in tasks:
        if task.completed_at:
            hour = task.completed_at.hour
            hour_completions[hour] = hour_completions.get(hour, 0) + 1
    
    if hour_completions:
        peak_hour = max(hour_completions, key=hour_completions.get)
        time_patterns["peak_hours"] = [peak_hour]
    
    # Most productive day
    day_completions = {}
    for task in tasks:
        if task.completed_at:
            day = task.completed_at.strftime("%A")
            day_completions[day] = day_completions.get(day, 0) + 1
    
    if day_completions:
        time_patterns["most_productive_day"] = max(day_completions, key=day_completions.get)
    
    # Calculate procrastination index (time between creation and start)
    start_times = []
    for task in tasks:
        if task.started_at and task.created_at:
            delay = (task.started_at - task.created_at).total_seconds() / 3600
            start_times.append(delay)
    
    if start_times:
        time_patterns["procrastination_index"] = sum(start_times) / len(start_times)
    
    return time_patterns

def calculate_user_performance(db: Session, user_id: int, date_range: DateRangeParams) -> dict:
    """Calculate user performance metrics"""
    
    # Get user stats
    user_stats = db.query(
        func.count(models.Task.id).label("total"),
        func.sum(case((models.Task.status == TaskStatus.COMPLETED, 1), else_=0)).label("completed"),
        func.avg(case(
            (and_(models.Task.status == TaskStatus.COMPLETED, models.Task.completed_at.isnot(None)),
             func.extract('epoch', models.Task.completed_at - models.Task.created_at)),
            else_=None
        )).label("avg_time")
    ).filter(
        models.Task.owner_id == user_id,
        models.Task.created_at >= date_range.start_date,
        models.Task.created_at <= date_range.end_date
    ).first()
    
    # Calculate consistency score
    daily_completion = db.query(
        func.date(models.Task.completed_at).label("date"),
        func.count(models.Task.id).label("count")
    ).filter(
        models.Task.owner_id == user_id,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_at >= date_range.start_date,
        models.Task.completed_at <= date_range.end_date
    ).group_by(func.date(models.Task.completed_at)).all()
    
    if daily_completion:
        avg_daily = sum(d.count for d in daily_completion) / len(daily_completion)
        variance = sum((d.count - avg_daily) ** 2 for d in daily_completion) / len(daily_completion)
        consistency_score = max(0, 100 - (variance * 10))
    else:
        consistency_score = 0
    
    return {
        "total_tasks_completed": user_stats.completed or 0,
        "average_completion_time_hours": round((user_stats.avg_time or 0) / 3600, 2),
        "consistency_score": round(consistency_score, 1),
        "rank": calculate_user_rank(db, user_id),
        "streak_days": calculate_current_streak(db, user_id)
    }

def generate_insights(completed: int, total: int, rate: float, avg_time: float, overdue: int, score: float, previous_tasks: List) -> List:
    """Generate actionable insights from data"""
    insights = []
    
    if rate < 50:
        insights.append("⚠️ Your completion rate is below 50%. Consider breaking down large tasks into smaller ones.")
    elif rate > 80:
        insights.append("✅ Excellent completion rate! Keep up the great work!")
    
    if avg_time > 48:  # More than 2 days
        insights.append("⏱️ Tasks are taking longer than average to complete. Try using time-boxing technique.")
    
    if overdue > 5:
        insights.append("📅 You have several overdue tasks. Consider reprioritizing your workload.")
    
    if score > 80:
        insights.append("🎯 Outstanding productivity score! You're in the top tier of performers.")
    elif score < 40:
        insights.append("📈 Your productivity score needs improvement. Try the Pomodoro technique.")
    
    if previous_tasks:
        prev_completed = sum(1 for t in previous_tasks if t.status == TaskStatus.COMPLETED)
        if completed > prev_completed:
            insights.append(f"📊 Productivity increased by {((completed - prev_completed) / (prev_completed or 1) * 100):.0f}% compared to previous period!")
    
    return insights[:5]  # Return top 5 insights

def forecast_completion(tasks: List, start_date: datetime, end_date: datetime) -> List:
    """Forecast task completion using simple linear regression"""
    forecast = []
    
    # Group completions by day
    daily_completions = {}
    for task in tasks:
        if task.completed_at:
            date_key = task.completed_at.date()
            daily_completions[date_key] = daily_completions.get(date_key, 0) + 1
    
    if len(daily_completions) < 2:
        return []
    
    # Simple moving average for next 7 days
    dates = sorted(daily_completions.keys())
    values = [daily_completions[date] for date in dates]
    
    for i in range(1, 8):
        future_date = end_date + timedelta(days=i)
        # Use last 3 days average for forecast
        recent_avg = sum(values[-3:]) / min(3, len(values))
        forecast.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "predicted_completions": round(recent_avg, 1),
            "confidence": min(90, len(values) * 10)  # Confidence based on data points
        })
    
    return forecast

def calculate_burnout_risk(tasks: List, hourly_activity: List) -> dict:
    """Calculate burnout risk based on work patterns"""
    
    # Analyze overtime work (hours outside 9-5)
    overtime_hours = sum(1 for hour_data in hourly_activity 
                        if hour_data["hour"] < 9 or hour_data["hour"] > 17)
    
    # Check for consistent overtime
    overtime_risk = "Low"
    if overtime_hours > 10:
        overtime_risk = "High"
    elif overtime_hours > 5:
        overtime_risk = "Medium"
    
    # Check for weekend work
    weekend_work = False
    for task in tasks:
        if task.completed_at and task.completed_at.weekday() >= 5:
            weekend_work = True
            break
    
    risk_score = 0
    if overtime_risk == "High":
        risk_score += 40
    elif overtime_risk == "Medium":
        risk_score += 20
    
    if weekend_work:
        risk_score += 30
    
    return {
        "risk_level": "High" if risk_score > 50 else "Medium" if risk_score > 25 else "Low",
        "risk_score": risk_score,
        "recommendations": [
            "Take regular breaks during work hours",
            "Set boundaries for after-hours work",
            "Practice time management techniques"
        ]
    }

def calculate_efficiency_score(tasks: List) -> float:
    """Calculate overall efficiency score"""
    if not tasks:
        return 0
    
    # Calculate task completion efficiency
    completed_tasks = [t for t in tasks if t.status == TaskStatus.COMPLETED]
    if not completed_tasks:
        return 0
    
    # Compare estimated vs actual time
    efficiency_ratios = []
    for task in completed_tasks:
        if task.estimated_hours and task.completed_at and task.created_at:
            actual_hours = (task.completed_at - task.created_at).total_seconds() / 3600
            if task.estimated_hours > 0:
                ratio = min(2, task.estimated_hours / actual_hours)  # Cap at 2x
                efficiency_ratios.append(ratio)
    
    if efficiency_ratios:
        avg_efficiency = sum(efficiency_ratios) / len(efficiency_ratios)
        return min(100, avg_efficiency * 100)
    
    return 50  # Default score

def calculate_focus_time(tasks: List) -> float:
    """Calculate percentage of focused work time"""
    # This would require tracking start/stop times
    # Placeholder implementation
    return 65.5

def calculate_current_streak(db: Session, user_id: int) -> int:
    """Calculate current completion streak in days"""
    # Get last 30 days of completions
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    completions = db.query(
        func.date(models.Task.completed_at).label("date")
    ).filter(
        models.Task.owner_id == user_id,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_at >= thirty_days_ago
    ).distinct().all()
    
    completion_dates = {c.date for c in completions}
    
    streak = 0
    current_date = datetime.now().date()
    
    while current_date in completion_dates:
        streak += 1
        current_date -= timedelta(days=1)
    
    return streak

def calculate_user_rank(db: Session, user_id: int) -> str:
    """Calculate user rank based on performance"""
    # Get user's percentile
    user_score = db.query(
        func.sum(case((models.Task.status == TaskStatus.COMPLETED, 1), else_=0)).label("score")
    ).filter(
        models.Task.owner_id == user_id
    ).scalar() or 0
    
    # Get all users scores
    all_scores = db.query(
        models.Task.owner_id,
        func.sum(case((models.Task.status == TaskStatus.COMPLETED, 1), else_=0)).label("score")
    ).group_by(models.Task.owner_id).all()
    
    scores = [s.score for s in all_scores if s.score]
    if not scores:
        return "Bronze"
    
    percentile = sum(1 for s in scores if s < user_score) / len(scores) * 100
    
    if percentile > 90:
        return "Diamond"
    elif percentile > 70:
        return "Platinum"
    elif percentile > 50:
        return "Gold"
    elif percentile > 25:
        return "Silver"
    else:
        return "Bronze"

def get_active_users_count(db: Session) -> int:
    """Get count of active users in last 5 minutes"""
    five_min_ago = datetime.now() - timedelta(minutes=5)
    return db.query(models.User).filter(
        models.User.last_activity >= five_min_ago
    ).count()

def calculate_current_productivity_rate(tasks: List) -> float:
    """Calculate current productivity rate"""
    if not tasks:
        return 0
    
    last_hour = datetime.now() - timedelta(hours=1)
    completed_last_hour = sum(1 for t in tasks if t.completed_at and t.completed_at >= last_hour)
    
    return completed_last_hour * 100  # Tasks per hour rate

def generate_ai_summary(analytics: AnalyticsResponse, detailed: DetailedAnalyticsResponse) -> str:
    """Generate AI-powered summary of analytics"""
    summary = f"""
    Performance Overview:
    • You've completed {analytics.completed_tasks} out of {analytics.total_tasks} tasks ({analytics.completion_rate:.1f}% completion rate)
    • Your productivity score is {analytics.productivity_score:.1f}/100
    • Average task completion takes {analytics.average_completion_time:.1f} hours
    
    Key Achievements:
    • {analytics.tasks_by_priority[0]['name'] if analytics.tasks_by_priority else 'No'} priority tasks are your strongest area
    • Best performance day: {detailed.time_analysis.get('most_productive_day', 'N/A')}
    """
    
    return summary

def generate_recommendations(analytics: AnalyticsResponse, detailed: DetailedAnalyticsResponse) -> List[str]:
    """Generate actionable recommendations"""
    recommendations = []
    
    if analytics.overdue_tasks > 0:
        recommendations.append(f"Address {analytics.overdue_tasks} overdue tasks immediately")
    
    if analytics.average_completion_time > 24:
        recommendations.append("Break down long-running tasks into smaller subtasks")
    
    if detailed.bottleneck_tasks:
        recommendations.append(f"Resolve bottlenecks: {detailed.bottleneck_tasks[0]['title']} is blocking {detailed.bottleneck_tasks[0]['blocking_count']} tasks")
    
    if detailed.custom_reports.get("burnout_risk", {}).get("risk_level") == "High":
        recommendations.append("⚠️ High burnout risk detected. Take regular breaks and delegate when possible")
    
    return recommendations[:5]

def generate_predictions(analytics: AnalyticsResponse, detailed: DetailedAnalyticsResponse) -> dict:
    """Generate predictions for future performance"""
    return {
        "estimated_completion_rate_next_week": min(100, analytics.completion_rate + 5),
        "predicted_productivity_trend": "upward" if analytics.productivity_score > 70 else "stable",
        "tasks_to_complete_by_month_end": int(analytics.total_tasks * 0.8),
        "risk_of_slippage": "Low" if analytics.completion_rate > 70 else "Medium"
    }

def identify_risk_factors(analytics: AnalyticsResponse, detailed: DetailedAnalyticsResponse) -> List[str]:
    """Identify potential risks"""
    risks = []
    
    if analytics.overdue_tasks > analytics.total_tasks * 0.2:
        risks.append("High number of overdue tasks affecting deadlines")
    
    if detailed.task_aging and len(detailed.task_aging) > 5:
        risks.append("Multiple aging tasks that may become unmanageable")
    
    if detailed.custom_reports.get("burnout_risk", {}).get("risk_level") == "High":
        risks.append("Team burnout risk - consider workload redistribution")
    
    return risks

def generate_optimization_tips(analytics: AnalyticsResponse, detailed: DetailedAnalyticsResponse) -> List[str]:
    """Generate optimization tips"""
    tips = []
    
    # Analyze peak performance hours
    if detailed.hourly_activity:
        peak_hours = [h for h in detailed.hourly_activity if h["productivity"] > 70]
        if peak_hours:
            best_hour = peak_hours[0]["hour"]
            tips.append(f"Schedule important tasks between {best_hour}:00 - {best_hour+1}:00 for peak productivity")
    
    # Project-based tips
    for project in analytics.project_distribution[:3]:
        if project["progress"] < 50:
            tips.append(f"Focus on {project['name']} project - only {project['progress']:.0f}% complete")
    
    return tips[:5]