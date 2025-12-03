import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCalendarData } from '../../api/tasks';
import type { TaskFilters, TaskListItem } from '../../api/tasks';

interface TaskCalendarViewProps {
  filters: TaskFilters;
}

const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({ filters }) => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks-calendar', year, month, filters],
    queryFn: () => getCalendarData(year, month),
  });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const getDaysInMonth = () => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = () => {
    const day = new Date(year, month - 1, 1).getDay();
    return day === 0 ? 6 : day - 1; // Преобразуем воскресенье с 0 на 6
  };

  const getTasksForDay = (day: number): TaskListItem[] => {
    if (!tasks) return [];
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasks.filter(task => {
      const taskDate = task.deadline?.split('T')[0];
      return taskDate === dateStr;
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const daysInMonth = getDaysInMonth();
  const firstDay = getFirstDayOfMonth();
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={handlePrevMonth}>
          <ChevronLeft />
        </IconButton>
        <Typography variant="h5">
          {monthNames[month - 1]} {year}
        </Typography>
        <IconButton onClick={handleNextMonth}>
          <ChevronRight />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
        }}
      >
        {/* Заголовки дней недели */}
        {weekDays.map(day => (
          <Box
            key={day}
            sx={{
              p: 1,
              textAlign: 'center',
              fontWeight: 'bold',
              color: 'text.secondary',
            }}
          >
            {day}
          </Box>
        ))}

        {/* Пустые ячейки до первого дня месяца */}
        {Array.from({ length: firstDay }).map((_, idx) => (
          <Box key={`empty-${idx}`} sx={{ minHeight: 100 }} />
        ))}

        {/* Дни месяца */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1;
          const dayTasks = getTasksForDay(day);
          const isToday =
            day === new Date().getDate() &&
            month === new Date().getMonth() + 1 &&
            year === new Date().getFullYear();

          return (
            <Paper
              key={day}
              variant="outlined"
              sx={{
                p: 1,
                minHeight: 100,
                backgroundColor: isToday ? 'action.selected' : 'background.paper',
                cursor: dayTasks.length > 0 ? 'pointer' : 'default',
                '&:hover': {
                  backgroundColor: dayTasks.length > 0 ? 'action.hover' : undefined,
                },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isToday ? 'bold' : 'normal',
                  color: isToday ? 'primary.main' : 'text.primary',
                  mb: 0.5,
                }}
              >
                {day}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {dayTasks.slice(0, 3).map(task => (
                  <Chip
                    key={task.id}
                    label={task.title}
                    size="small"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    sx={{
                      fontSize: '0.7rem',
                      height: 20,
                      '& .MuiChip-label': {
                        px: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      },
                    }}
                    color={task.is_overdue ? 'error' : 'primary'}
                  />
                ))}
                {dayTasks.length > 3 && (
                  <Typography variant="caption" color="text.secondary">
                    +{dayTasks.length - 3} ещё
                  </Typography>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Paper>
  );
};

export default TaskCalendarView;
